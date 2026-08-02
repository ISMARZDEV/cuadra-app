"""Use case MatchStoreProduct (F2.0 §Cascade Contract): cascada de matching store_product ->
canonical_product. EAN exacto -> léxico (trgm) + semántico (vector) fusionados por RRF -> boosts
deterministas (marca/tamaño exactos) -> banding por umbral -> LLM judge SOLO en banda gris ->
cola humana. `product_match` es la fuente de verdad del enlace (Sacred rule); el FK denormalizado
`store_product.canonical_product_id` se escribe SOLO junto con el `product_match` correspondiente
— este use case es el dueño de esa frontera transaccional (ver design), nunca un trigger de DB.

Puertos (Batch 8): la etapa EAN (`ProductMatchRepository.find_candidates_by_ean`) y el escritor
del FK denormalizado (`StoreProductRepository.link_to_canonical`) están formalizados en los
puertos compartidos de `domain/ports/repositories.py` — el use case depende SOLO de esas
abstracciones (DIP, ADR 31), nunca de la infra concreta. El judge, en cambio, no tiene puerto de
dominio (es un adapter LLM de un solo propósito): se consume vía un `Protocol` estructural LOCAL
(`GreyBandJudge`), que `LlmJudge` satisface sin heredar de nada y sin que la aplicación importe
infraestructura.

Nota de diseño (RRF vs banding): con `DEFAULT_RRF_K=60` (Batch 3, fusion.py) el score fusionado
por RRF nunca supera ~2/(k+1) ≈ 0.033 — muy por debajo de MATCH_MID_THRESHOLD=0.55. Usar
literalmente ese score fusionado para el banding haría "grey"/"auto_link" inalcanzables vía
trgm/vector. Por eso RRF se usa aquí SOLO para decidir el candidato GANADOR por consenso entre
etapas (su propósito real: Reciprocal RANK Fusion), y el score que se banda es el MEJOR score
crudo por-etapa del candidato ganador (0..1, comparable a los umbrales) + boosts. Ver el reporte
de la batch para más detalle — bandera para confirmar en revisión antes de Batch 8.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from ..domain.entities import MatchCandidate, MatchCandidateSnapshot, ProductMatch
from ..domain.ports import (
    CanonicalProductRepository,
    StoreProductRepository,
)
from ..domain.ports.repositories import EmbeddingProvider, ProductMatchRepository
from ..infrastructure.classification.lexicon import LexiconIndex, lexicon_match_path
from ..infrastructure.matching.cascade.banding import JUDGE_MATCH_MIN_CONFIDENCE, determine_band
from ..infrastructure.matching.cascade.brand_gate import brand_unsupported
from ..infrastructure.matching.cascade.category_gate import categories_conflict, category_boost
from ..infrastructure.matching.cascade.embedding_text import build_embedding_text
from ..infrastructure.matching.cascade.form_gate import forms_conflict
from ..infrastructure.matching.cascade.fusion import reciprocal_rank_fusion
from ..infrastructure.matching.cascade.quality_gate import qualities_conflict
from ..infrastructure.matching.cascade.scoring import apply_boosts
from ..infrastructure.matching.cascade.size_gate import sizes_conflict
from ..infrastructure.matching.cascade.variant_gate import variants_conflict


@dataclass(frozen=True, slots=True)
class IncomingStoreProduct:
    """Entrada del use case: un store_product recién observado, TODAVÍA sin canonical_product_id
    (previo al matching). No es el `StoreProduct` de dominio (Batch 2) porque ese requiere
    `canonical_product_id` no-nulo — este es, por definición, el ANTES del enlace.
    """

    store_product_id: str
    market_id: str
    name: str
    brand: str
    size: str
    ean: str | None = None
    # Etapa C: categoría CRUDA de la fuente (path del adapter) — segunda señal para el category
    # gate/boost. "" si la fuente no la trae → sin señal de categoría (no-op).
    source_category: str = ""
    # Corrida que observó este producto (F4 #4.5). Viaja con la OBSERVACIÓN y no en el constructor
    # del use-case porque es propiedad de este hallazgo, no del matcher. Se estampa en el
    # `ProductMatch` para poder filtrar la cola por corrida y atribuir los canónicos que salgan.
    run_id: str | None = None
    # Tienda que lo publicó — para el invariante de proveedor único (ver `execute`). Viaja con la
    # observación por la misma razón que `run_id`: es propiedad del hallazgo, no del matcher.
    # "" = desconocido → el invariante no se aplica (conservador).
    provider_id: str = ""

    def __post_init__(self) -> None:
        if not self.store_product_id.strip():
            raise ValueError("IncomingStoreProduct.store_product_id no puede estar vacío")
        if not self.name.strip():
            raise ValueError("IncomingStoreProduct.name no puede estar vacío")


class GreyBandJudge(Protocol):
    """Lo mínimo que el use case necesita del judge (ver `LlmJudge.judge`, Batch 6) — definido
    aquí (no en domain/ports) para no acoplar la aplicación al tipo concreto de infraestructura;
    duck-typing estructural: `LlmJudge` lo satisface sin heredar de nada."""

    def judge(self, *, store_product: dict, canonical_product: dict) -> _JudgeVerdictLike: ...


class _JudgeVerdictLike(Protocol):
    decision: str
    confidence: float
    cited_fields: list[str]
    # F2·B1 (1.14): costo del juez, para wirearlo a `product_match` en el camino grey-band/llm.
    input_tokens: int | None
    output_tokens: int | None
    model: str | None
    # ¿El juez emitió este veredicto, o es el fail-safe del adapter? (breaker abierto / API caída /
    # salida ilegible). Distingue "el juez dudó" de "el juez no estuvo" — ver `execute`.
    degraded: bool


class MatchStoreProduct:
    """Cascada EAN -> trgm+vector (RRF) -> boosts -> banding -> judge (grey) -> revisión humana."""

    def __init__(
        self,
        *,
        match_repo: ProductMatchRepository,
        store_repo: StoreProductRepository,
        canonical_repo: CanonicalProductRepository,
        # `None` = sin etapa vectorial. La API no siempre lleva modelo (`build_api_embedder`
        # devuelve None sin endpoint HTTP ni modelo in-process) y la cascada debe poder correr
        # igual: el EAN y el trgm no dependen del modelo.
        embedding_provider: EmbeddingProvider | None,
        judge: GreyBandJudge | None,
        category_lexicon: LexiconIndex | None = None,
        leaf_to_parent: dict[str, str] | None = None,
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo
        self._canonical_repo = canonical_repo
        self._embedder = embedding_provider
        self._judge = judge
        # Etapa C (opcional, ship-safe): índice léxico hoja + mapa hoja→padre para la señal de
        # categoría. None/{} = sin señal → la cascada se comporta como antes (cero regresión).
        self._category_lexicon = category_lexicon
        self._leaf_to_parent = leaf_to_parent or {}

    def _resolve_store_leaf(self, source_category: str) -> str | None:
        """Hoja de categoría del store desde su categoría de ORIGEN (lexicon por segmento, mismo
        motor que la clasificación). None si no hay lexicon inyectado o no resuelve."""
        if self._category_lexicon is None or not source_category:
            return None
        hit = lexicon_match_path(source_category, self._category_lexicon)
        return hit[0] if hit else None

    def execute(self, product: IncomingStoreProduct) -> ProductMatch:
        # --- Etapa 1: EAN exacto ---
        if product.ean:
            ean_candidates = self._match_repo.find_candidates_by_ean(product.ean, product.market_id)
            distinct_ids = {c.canonical_product_id for c in ean_candidates}
            if len(distinct_ids) == 1:
                return self._auto_link(product, next(iter(distinct_ids)), confidence=1.0, method="ean")
            if len(distinct_ids) > 1:
                # EAN ambiguo (colisión): NO se autolinkea, ni se intentan las demás etapas —
                # una señal fuerte contradictoria no se "arregla" cayendo a un score más débil.
                # El revisor necesita VER los canónicos que colisionan (1.11/1.12).
                collision_snapshots = [self._snapshot(cid, 1.0) for cid in distinct_ids]
                return self._to_review(
                    product, method="human", confidence=0.0, candidates=collision_snapshots
                )
            # 0 candidatos -> cae a la etapa léxica/semántica (EAN null se salta este bloque igual)

        # --- Etapa 2/3: léxico (trgm) + semántico (vector), fusionados por RRF ---
        trgm_candidates = self._match_repo.find_candidates_trgm(product.name, product.market_id)
        # Sin embedder la etapa vectorial se OMITE, no se alimenta con un vector inventado: un
        # vector falso devolvería vecinos arbitrarios que el RRF fusionaría como candidatos reales.
        if self._embedder is None:
            vector_candidates: list[MatchCandidate] = []
        else:
            embedding_text = build_embedding_text(product.name, product.brand, product.size)
            embedding = self._embedder.embed([embedding_text])[0]
            vector_candidates = self._match_repo.find_candidates_vector(
                embedding, product.market_id
            )

        fused = reciprocal_rank_fusion(trgm_candidates, vector_candidates)
        if not fused:
            return self._to_review(product, method="human", confidence=0.0)

        winner_id = fused[0].canonical_product_id
        in_trgm = any(c.canonical_product_id == winner_id for c in trgm_candidates)
        in_vector = any(c.canonical_product_id == winner_id for c in vector_candidates)
        raw_score = self._best_raw_score(winner_id, trgm_candidates, vector_candidates)

        canonical = self._canonical_repo.get_by_id(winner_id)
        brand_match = self._exact_match(product.brand, canonical.brand if canonical else None)
        size_match = self._exact_match(
            product.size, canonical.display_size if canonical else None
        )

        final_score = apply_boosts(
            raw_score, brand_exact_match=brand_match, size_exact_match=size_match
        )
        # Category signal (Etapa C): +boost si misma HOJA; gate por PADRE distinto. Reusa la señal
        # de ORIGEN del store (lexicon, mismo motor que la clasificación) vs la hoja del canónico.
        # Ship-safe: sin lexicon inyectado o categorías desconocidas → boost 0 / gate False (no-op).
        store_leaf = self._resolve_store_leaf(product.source_category)
        canonical_leaf = canonical.taxonomy_node_id if canonical else None
        final_score = min(1.0, final_score + category_boost(store_leaf, canonical_leaf))
        category_conflict = categories_conflict(
            self._leaf_to_parent.get(store_leaf) if store_leaf else None,
            self._leaf_to_parent.get(canonical_leaf) if canonical_leaf else None,
        )
        band = determine_band(final_score)
        stage_method = "hybrid" if (in_trgm and in_vector) else ("trgm" if in_trgm else "vector")

        # Size gate (Batch 10): el score lo domina el nombre y confundía tamaños (colapsaba
        # 1/5/20/50 Lb del mismo arroz en un canónico). Un tamaño comparable y en conflicto es
        # señal DURA de SKU distinto: NUNCA auto-linkea, va a revisión — en ninguna banda.
        size_conflict = sizes_conflict(product.size, canonical.quantity if canonical else None)

        # EAN-negative gate (falso-merge, medido 2026-07-16): si el entrante trae un EAN y el
        # canónico ganador YA tiene un EAN conocido DISTINTO, son SKUs distintos — la señal de
        # nombre/marca/tamaño NUNCA debe auto-mergearlos (regla sacra #4). El boost marca+tamaño
        # colapsaba productos de la misma línea "La Famosa 15 Oz" con contenido distinto; el
        # size_gate no lo atajaba (los tamaños COINCIDEN). Ver `_ean_conflicts`.
        ean_conflict = self._ean_conflicts(product.ean, winner_id)

        # Variant gate: dos SKUs de la misma marca+tamaño que solo difieren en el CONTENIDO
        # (Habichuela Pinta vs Negra). Cubre el falso-merge donde el EAN gate no llega — Magento
        # no expone barcode. Lee la variante del nombre; ver `variant_gate`.
        variant_conflict = variants_conflict(product.name, canonical.name if canonical else "")

        # Brand gate: el canónico declara marca y el store no la corrobora ni en su campo marca ni
        # en su nombre → sin evidencia de marca, no se auto-mergea dentro de un SKU de marca. A
        # diferencia de los gates de arriba bloquea por AUSENCIA de evidencia, no por contradicción;
        # ver `brand_gate` para por qué la asimetría es deliberada.
        brand_missing = brand_unsupported(
            product.brand, product.name, canonical.brand if canonical else None
        )

        # Quality gate: la LÍNEA de calidad (Premium / Selecto / Super Selecto…) distingue SKUs que
        # comparten marca, tamaño y categoría. Medido 2026-08-01: 5 canónicos habían absorbido SKUs
        # distintos de la MISMA tienda, y con confianza de hasta 1.000 — los boosts empujan al tope
        # justo a esta clase de error, porque premian las dimensiones que no discriminan acá.
        quality_conflict = qualities_conflict(
            product.name,
            canonical.name if canonical else "",
            canonical.quality if canonical else None,
        )

        # Form gate: la FORMA de preparación distingue SKUs que comparten marca, tamaño, categoría,
        # color y especie — harina de arroz no es arroz, y habichuelas guisadas no son secas. Medido
        # 2026-08-01 en la primera corrida con el juez encendido: 3 falsos merges por este eje, dos
        # firmados por el JUEZ (0.850) y uno por la cascada determinista (0.902). A diferencia del
        # variant gate, un nombre SIN marca de forma no es "sin señal" sino la forma BASE; ver
        # `form_gate` para por qué esa asimetría es deliberada.
        form_conflict = forms_conflict(product.name, canonical.name if canonical else "")

        # Invariante de PROVEEDOR ÚNICO: una tienda no publica el mismo producto dos veces, así que
        # si el canónico ganador ya tiene un `store_product` de ESTA tienda, el entrante es otro SKU.
        #
        # A diferencia de los demás, este gate no es semántico sino ESTRUCTURAL, y por eso cubre los
        # ejes que no anticipamos. Medido 2026-08-01: los 5 falsos merges de la primera corrida real
        # tenían CUATRO ejes distintos (línea de calidad, seco/verde, con vegetales, estilo
        # americano) — perseguirlos de a uno es una carrera sin final; este invariante los ataja a
        # todos y bloquea 6 enlaces malos sin tocar ninguno bueno.
        provider_dup = bool(product.provider_id) and self._store_repo.has_other_product_from_provider(
            winner_id, product.provider_id, product.store_product_id
        )

        # Los 8 gates son vetos DETERMINISTAS del auto-enlace: si cualquiera se activa, el par va a
        # revisión cualquiera sea la banda y cualquiera sea el veredicto del juez. Colapsarlos en una
        # sola señal permite evaluarla ANTES del juez (ver banda gris abajo), que es donde la
        # diferencia se paga en dinero.
        gate_veto = (
            size_conflict
            or category_conflict
            or ean_conflict
            or variant_conflict
            or brand_missing
            or quality_conflict
            or form_conflict
            or provider_dup
        )

        if band == "auto_link":
            if gate_veto:
                return self._to_review(
                    product, method=stage_method, confidence=final_score,
                    candidates=self._fused_snapshots(fused, trgm_candidates, vector_candidates),
                )
            return self._auto_link(product, winner_id, confidence=final_score, method=stage_method)

        # Banda gris con un gate activo: el desenlace YA está decidido, así que no se paga el juez.
        # Un veredicto no puede levantar un veto determinista — la condición de auto-enlace de abajo
        # exige `not gate_veto` — de modo que la llamada sólo agregaría tokens y latencia a un
        # resultado idéntico. Medido sobre la cola real el 2026-08-01, justo antes de encender
        # `SAVE_LLM_JUDGE_ENABLED`: de 158 pares en banda gris, 152 (96.2%) tenían un gate activo;
        # encender el juez sin este corte habría gastado 152 llamadas de cada 158 en pares cuyo
        # destino no dependía de la respuesta.
        #
        # Se registra con la MISMA semántica que el camino "juez apagado" de abajo (`method="human"`,
        # confianza de la cascada, sin columnas de costo): el juez no dictaminó este par, y decir
        # `llm` mentiría en la distinción que defienden tanto ese camino como el de `degraded`.
        if band == "grey" and gate_veto:
            return self._to_review(
                product, method="human", confidence=final_score,
                candidates=self._fused_snapshots(fused, trgm_candidates, vector_candidates),
            )

        if band == "grey" and self._judge is None:
            # LLM apagado (`SAVE_LLM_JUDGE_ENABLED=false`): la banda gris va DIRECTO a revisión, sin
            # round-trip. `method="human"` y NO "llm" a propósito — el juez nunca corrió, y decir lo
            # contrario mentiría en la misma distinción que defiende CRITICAL-1 abajo (mirarías la
            # cola creyendo que el LLM dudó de N productos). Los candidatos SÍ se guardan: son lo que
            # el humano necesita para decidir. La cascada determinista (EAN/alta) no se toca: apagar
            # el LLM no apaga el matching, solo su tramo caro.
            return self._to_review(
                product, method="human", confidence=final_score,
                candidates=self._fused_snapshots(fused, trgm_candidates, vector_candidates),
            )

        if band == "grey":
            assert self._judge is not None  # el caso None ya retornó arriba
            verdict = self._judge.judge(
                store_product={
                    "name": product.name,
                    "brand": product.brand,
                    "size": product.size,
                    "ean": product.ean,
                },
                canonical_product={
                    "name": canonical.name if canonical else None,
                    "brand": canonical.brand if canonical else None,
                    "size": canonical.display_size if canonical else None,
                    "ean": None,
                },
            )
            # CRITICAL-1 (verify follow-up): un veredicto "match" del judge SOLO autolinkea si su
            # propia confianza alcanza el piso — por debajo, es un match débil y va a revisión
            # (method="llm", NO "human": el judge SÍ corrió, solo no fue lo bastante seguro).
            # `not gate_veto` es hoy redundante (el corte de arriba ya retornó si algún gate se
            # activó) y se conserva a propósito: es el invariante que hace SEGURO ese corte —
            # ningún veredicto auto-enlaza por encima de un veto. Si alguien reordena la cascada,
            # el veto sigue puesto acá y los tests de los gates en banda gris lo siguen cubriendo.
            if (
                verdict.decision == "match"
                and verdict.confidence >= JUDGE_MATCH_MIN_CONFIDENCE
                and not gate_veto
            ):
                return self._auto_link(
                    product, winner_id, confidence=verdict.confidence, method="llm",
                    judge_input_tokens=verdict.input_tokens,
                    judge_output_tokens=verdict.output_tokens,
                    judge_model=verdict.model,
                )
            # Un veredicto DEGRADADO (breaker abierto / API caída / salida ilegible) no es señal del
            # juez: es el fail-safe del adapter ocupando su lugar. Registrarlo como "llm" mentiría
            # exactamente igual que el camino de arriba, pero al revés — leerías la cola creyendo
            # que el juez dudó de N productos que nunca vio (medido 2026-07-15: 8 de 11). Cae a la
            # red humana con la MISMA semántica que el camino "juez apagado".
            method = "human" if verdict.degraded else "llm"
            return self._to_review(
                product, method=method, confidence=verdict.confidence,
                candidates=self._fused_snapshots(fused, trgm_candidates, vector_candidates),
                judge_input_tokens=verdict.input_tokens,
                judge_output_tokens=verdict.output_tokens,
                judge_model=verdict.model,
            )

        # band == "human": score debajo de MID
        return self._to_review(
            product, method="human", confidence=final_score,
            candidates=self._fused_snapshots(fused, trgm_candidates, vector_candidates),
        )

    # ---------------------------------------------------------------- helpers ----------

    @staticmethod
    def _best_raw_score(
        canonical_product_id: str,
        trgm_candidates: Sequence[MatchCandidate],
        vector_candidates: Sequence[MatchCandidate],
    ) -> float:
        scores = [
            c.score
            for stage in (trgm_candidates, vector_candidates)
            for c in stage
            if c.canonical_product_id == canonical_product_id
        ]
        return max(scores) if scores else 0.0

    @staticmethod
    def _exact_match(incoming: str | None, candidate: str | None) -> bool:
        """Igualdad exacta para los boosts. Un lado ausente = NO hay coincidencia, nunca un boost.

        Guarda los DOS lados: el entrante también puede venir vacío (Bravo y Nacional no publican
        marca). Antes sólo se guardaba `candidate`, y un `incoming` nulo tumbaba la corrida entera
        con `None.strip()` en vez de simplemente no dar boost.
        """
        if not candidate or not incoming:
            return False
        return incoming.strip().casefold() == candidate.strip().casefold()

    def _ean_conflicts(self, incoming_ean: str | None, canonical_product_id: str) -> bool:
        """Gate de falso-merge (EAN-negativo): True si el entrante trae un EAN y el canónico ganador
        ya tiene un EAN conocido DISTINTO. Dos barcodes no-nulos distintos ⇒ SKUs distintos, y la
        señal de nombre/marca/tamaño no debe auto-mergearlos (regla sacra #4).

        Por construcción es un gate barato: si llegamos aquí con un `incoming_ean`, la etapa 1
        (`find_candidates_by_ean`) ya devolvió 0 candidatos — ningún `store_product` enlazado
        comparte ese barcode. Entonces CUALQUIER EAN conocido del ganador es necesariamente distinto;
        la comparación explícita solo lo hace robusto a normalizaciones."""
        if not incoming_ean:
            return False
        known = self._store_repo.find_ean_for_canonical(canonical_product_id)
        return known is not None and known != incoming_ean

    def _snapshot(self, canonical_product_id: str, score: float) -> MatchCandidateSnapshot:
        """Arma el snapshot de UN candidato para `review_candidate` (1.11/1.12): busca su
        name/brand en el canónico — la cascada de decisión (MatchCandidate) no los lleva."""
        canonical = self._canonical_repo.get_by_id(canonical_product_id)
        return MatchCandidateSnapshot(
            canonical_product_id=canonical_product_id,
            score=score,
            name=canonical.name if canonical else None,
            brand=canonical.brand if canonical else None,
        )

    def _fused_snapshots(
        self,
        fused: Sequence[MatchCandidate],
        trgm_candidates: Sequence[MatchCandidate],
        vector_candidates: Sequence[MatchCandidate],
    ) -> list[MatchCandidateSnapshot]:
        """Snapshots de TODOS los candidatos fusionados, con el MEJOR score crudo por-etapa
        (nunca el score fusionado por RRF, que solo sirve para elegir el ganador por consenso —
        ver la nota de diseño al tope del archivo). El repo enforce el cap top-5 (1.11)."""
        return [
            self._snapshot(
                c.canonical_product_id,
                self._best_raw_score(c.canonical_product_id, trgm_candidates, vector_candidates),
            )
            for c in fused
        ]

    def _auto_link(
        self,
        product: IncomingStoreProduct,
        canonical_product_id: str,
        *,
        confidence: float,
        method: str,
        judge_input_tokens: int | None = None,
        judge_output_tokens: int | None = None,
        judge_model: str | None = None,
    ) -> ProductMatch:
        # Invariante de misma-transacción: ambas escrituras se disparan aquí, contra los mismos
        # colaboradores inyectados (misma Session/UoW en producción) — este use case es el dueño
        # de la frontera transaccional, no la infraestructura.
        self._store_repo.link_to_canonical(product.store_product_id, canonical_product_id)
        self._match_repo.record_match(
            store_product_id=product.store_product_id,
            canonical_product_id=canonical_product_id,
            confidence=confidence,
            method=method,
            status="auto_linked",
            judge_input_tokens=judge_input_tokens,
            judge_output_tokens=judge_output_tokens,
            judge_model=judge_model,
            run_id=product.run_id,
        )
        # Un match auto_linked NUNCA persiste review_candidate (1.11/1.12) — nada que revisar.
        return ProductMatch(
            store_product_id=product.store_product_id,
            canonical_product_id=canonical_product_id,
            confidence=confidence,
            method=method,  # type: ignore[arg-type]
            status="auto_linked",
            run_id=product.run_id,
        )

    def _to_review(
        self,
        product: IncomingStoreProduct,
        *,
        method: str,
        confidence: float,
        candidates: Sequence[MatchCandidateSnapshot] = (),
        judge_input_tokens: int | None = None,
        judge_output_tokens: int | None = None,
        judge_model: str | None = None,
    ) -> ProductMatch:
        match_id = self._match_repo.record_match(
            store_product_id=product.store_product_id,
            canonical_product_id=None,
            confidence=confidence,
            method=method,
            status="pending_review",
            judge_input_tokens=judge_input_tokens,
            judge_output_tokens=judge_output_tokens,
            judge_model=judge_model,
            run_id=product.run_id,
        )
        if candidates:
            self._match_repo.record_candidates(match_id, candidates)
        return ProductMatch(
            store_product_id=product.store_product_id,
            canonical_product_id=None,
            confidence=confidence,
            method=method,  # type: ignore[arg-type]
            status="pending_review",
            run_id=product.run_id,
        )

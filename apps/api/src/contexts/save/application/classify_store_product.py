"""Use case `ClassifyStoreProduct` — cascada de clasificación de categoría (save-category-classification).

Espeja `MatchStoreProduct` SIN la etapa EAN, con una etapa léxica determinista al frente:

  léxico → (trgm + vector) → RRF (consenso del ganador) → banding(score CRUDO del ganador)
         → juez LLM (solo banda grey, con piso de confianza)

Persiste una fila `category_classification` `active` (la HOJA) SOLO cuando hay decisión confiable;
ante duda deja el producto SIN clasificar (NUNCA inventa categoría). RRF elige el ganador por
consenso, pero la BANDA se decide con el mejor score crudo del ganador (trgm/vector viven en [0,1]),
no con el score RRF (que es minúsculo) — mismo criterio que el matching.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from ..domain.classification import (
    CategoryCandidate,
    CategoryClassification,
    CategoryDecision,
    ClassifiableProduct,
    ClassificationResult,
)
from ..domain.ports.repositories import (
    CategoryCandidateRepository,
    CategoryClassificationRepository,
    CategoryJudgePort,
    EmbeddingProvider,
)
from ..infrastructure.classification.lexicon import (
    LexiconIndex,
    lexicon_match,
    lexicon_match_path,
    matched_tokens,
)
from ..infrastructure.classification.category_banding import decide_by_vector_margin
from ..infrastructure.matching.cascade.banding import JUDGE_MATCH_MIN_CONFIDENCE

_UNCLASSIFIED = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="none", band="human")

# Etapa B — confianzas de la política de cruce (señal de origen × señal de nombre).
_SOURCE_NAME_AGREE_CONFIDENCE = 0.97  # ambas señales fuertes coinciden → la decisión más confiable
_SOURCE_ONLY_CONFIDENCE = 0.90        # solo la fuente resuelve → autoridad sobre su propio producto
# Conflicto de dos señales fuertes: NO se auto-clasifica (mismo criterio que la colisión de EAN en
# el matching). Se deja sin clasificar para que el humano decida viendo ambas.
_CONFLICT = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="conflict", band="human")


@dataclass
class _Evidence:
    """Acumulador MUTABLE de lo que propuso cada señal, mientras la cascada corre.

    Mutable y privado a propósito: las señales se calculan en puntos distintos de la cascada
    (`_decide` cruza origen y nombre; `_classify_by_name` es quien ve el vector), y hacerlo
    inmutable obligaría a devolver tuplas por toda la cadena de llamadas, que es justo el tipo de
    ruido que hace ilegible una cascada. Nunca sale de este módulo: se traduce a `CategoryDecision`
    (frozen) antes de cruzar la frontera.
    """

    source_leaf_id: str | None = None
    name_leaf_id: str | None = None
    matched_tokens: tuple[str, ...] = ()
    vector_top: tuple[CategoryCandidate, ...] = ()


class CategoryDecisionRecorder(Protocol):
    """Lo mínimo que el use case necesita del registro de decisiones.

    Protocol estructural LOCAL, no puerto de dominio: es observabilidad de un solo propósito, y el
    dominio no tiene por qué conocerla (mismo criterio que `GreyBandJudge` en el matcher).
    """

    def record(self, decision: CategoryDecision) -> None: ...


class ClassifyStoreProduct:
    def __init__(
        self,
        classifications: CategoryClassificationRepository,
        candidates: CategoryCandidateRepository,
        # `None` = este proceso NO tiene el modelo de embeddings. No es un caso hipotético: la API
        # web no puede cargar BGE-M3 porque `sentence-transformers` vive en el grupo de dependencias
        # `ingestion` (misma regla que impide importar `dagster` en el adapter del orquestador —
        # importarlo reventaría la API al arrancar en producción, con un fallo invisible en local).
        # Simétrico a `judge=None`: sin la etapa, no se inventa categoría.
        embedder: EmbeddingProvider | None,
        judge: CategoryJudgePort | None,
        lexicon_index: LexiconIndex,
        decisions: CategoryDecisionRecorder | None = None,
        leaf_names: dict[str, str] | None = None,
        # GATE DE DEPARTAMENTO (2026-08-02). `parent_lexicon` mapea token → nodo RAÍZ, igual que
        # `lexicon_index` lo hace a hojas; `leaf_to_parent` dice de qué raíz cuelga cada hoja (el
        # mismo dict que ya consume el matcher, ver `_build_category_index`). Ambos `None` = la
        # cascada se comporta exactamente como antes.
        parent_lexicon: LexiconIndex | None = None,
        leaf_to_parent: dict[str, str] | None = None,
    ) -> None:
        self._classifications = classifications
        self._candidates = candidates
        self._embedder = embedder
        self._judge = judge
        self._lexicon = lexicon_index
        # Colaborador OPCIONAL (mismo patrón que el juez y el embedder): registra QUÉ decidió la
        # cascada y con qué evidencia, incluidas las abstenciones — que hoy no dejan rastro. `None`
        # = no registrar, y entonces la cascada se comporta EXACTAMENTE igual que antes: el recorder
        # no participa de ninguna decisión, solo la observa.
        self._decisions = decisions
        # hoja_id → nombre, para poder PREGUNTARLE al juez por una hoja que resolvió el léxico (que
        # sólo devuelve ids). Sin esto el arbitraje del conflicto no puede formular la pregunta, así
        # que ante su ausencia se abstiene como antes — cero regresión.
        self._leaf_names = leaf_names or {}
        self._parent_lexicon = parent_lexicon
        self._leaf_to_parent = leaf_to_parent or {}

    def _department_of(self, source_category: str) -> str | None:
        """Nodo RAÍZ que nombra la categoría de origen, o `None`.

        Medido 2026-08-02 sobre Bravo: el **31%** de los productos con origen legible nombra un
        DEPARTAMENTO y no una hoja («Lácteos», «Frutas y vegetales», «Bebés», «Carnes»). Esa señal
        se descartaba entera porque el léxico sólo indexa hojas, y el vector terminaba buscando
        entre las 133 del árbol — de ahí que a `RABANO ROJO LB` le propusiera `Ron`.

        ⚠️ **HOY NO SE CABLEA EN NINGUNA COMPOSICIÓN. No lo actives sin volver a medir.**

        El A/B con el juez encendido (12 productos de Bravo con departamento) lo desaconseja:

            sin gate:  3/12 resuelven  (≈2 correctos, 0 errores)
            con gate: 11/12 resuelven  (≈4 correctos, ≈5 ERRORES)

        `ALBAHACA VERDE`→«Víveres», `AJI MORRON ROJO`→«Hierbas Aromáticas`, `CALABAZA`→«Ensaladas»,
        `ANGUS MOLIDA`→«Albóndigas». El conteo sube de 25% a 92% y la CALIDAD baja: se cambian
        abstenciones por clasificaciones plausibles-y-equivocadas, que es peor, porque un humano ya
        no las caza de un vistazo.

        El mecanismo es contraintuitivo y vale entenderlo antes de reintentar: **acotar le hace el
        trabajo más DIFÍCIL al juez**. Sin gate rechaza «¿un ají es Ron?» sin dudar; con gate tiene
        que distinguir «Hierbas Aromáticas» de «Vegetales Frescos» dentro del mismo departamento, y
        esa discriminación fina la falla. El filtro le quita justo las opciones absurdas que hacían
        obvio el «no».

        Se conserva —con sus tests— porque la señal ES real y el 31% es mucho; lo que falta es una
        forma de aprovecharla que no degrade la precisión (p.ej. piso de confianza más alto dentro
        del área, o usarla sólo como sugerencia para el humano en la cola de revisión).
        """
        if self._parent_lexicon is None or not source_category:
            return None
        hit = lexicon_match_path(source_category, self._parent_lexicon)
        return hit[0] if hit else None

    def execute(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        # Idempotente: si el producto YA tiene clasificación `active`, no re-corre la cascada (así
        # el enganche inline no reclasifica en cada refresh de precio, R11). Devuelve la existente.
        existing = self._classifications.active_for(
            product.ref_id, is_canonical=product.is_canonical
        )
        if existing is not None:
            return ClassificationResult(
                existing.taxonomy_node_id, existing.confidence, existing.method, "auto_link"
            )

        result, evidence = self._decide_with_evidence(product, market_id)
        # Persistencia ÚNICA (fuera de la decisión): solo si hay hoja confiable — ante duda/conflicto
        # NUNCA inventa categoría (regla sagrada, espeja el matching).
        if result.taxonomy_node_id is not None:
            self._persist(product, result.taxonomy_node_id, result.confidence, result.method)
        # El registro va DESPUÉS y aparte: guarda el evento de decisión (con o sin hoja) para poder
        # auditar después por qué la cascada resolvió lo que resolvió, sin re-correrla ni re-pagar el
        # LLM. Nunca sustituye a `_persist` — una abstención registrada sigue siendo una abstención.
        self._record(product, market_id, result, evidence)
        return result

    def decide(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        """Decisión de categoría PURA — sin idempotencia ni persistencia. Para consumidores que
        solo necesitan la categoría sin registrar la clasificación: el relevance gate R2 decide
        descartar ANTES de materializar el store_product, cuando todavía no hay `ref_id`."""
        return self._decide_with_evidence(product, market_id)[0]

    def _decide_with_evidence(
        self, product: ClassifiableProduct, market_id: str
    ) -> tuple[ClassificationResult, _Evidence]:
        """`_decide` + lo que propuso cada señal por separado.

        La evidencia viaja al lado del resultado en vez de dentro de `ClassificationResult` porque
        ese DTO lo consumen el relevance gate y la API, y no tienen nada que hacer con ella. La
        DECISIÓN es idéntica a la de antes de este cambio: acá no se decide nada nuevo, sólo se
        anota lo que ya se había calculado y se tiraba.
        """
        evidence = _Evidence()
        result = self._decide(product, market_id, evidence)
        return result, evidence

    def _decide(
        self,
        product: ClassifiableProduct,
        market_id: str,
        evidence: "_Evidence | None" = None,
    ) -> ClassificationResult:
        """Etapa B — cruza DOS señales independientes: la categoría de ORIGEN (fuente) y el NOMBRE.

        Política (mismo espíritu que el matching: señales fuertes; en conflicto → humano):
        - ambas resuelven y COINCIDEN → auto reforzado (`source_name`).
        - ambas resuelven y DIFIEREN  → conflicto → sin clasificar (lo decide el humano).
        - solo la fuente resuelve      → la fuente es autoridad (`source`).
        - solo el nombre resuelve      → comportamiento por-nombre (lexicon/trgm/vector/llm).
        """
        source_hit = self._match_source_path(product.source_category)
        by_name = self._classify_by_name(product, market_id, evidence)

        if evidence is not None:
            evidence.source_leaf_id = source_hit[0] if source_hit else None
            evidence.name_leaf_id = by_name.taxonomy_node_id

        if source_hit is None:
            return by_name  # sin señal de origen → solo nombre

        source_leaf, _ = source_hit
        if by_name.taxonomy_node_id is None:
            return ClassificationResult(source_leaf, _SOURCE_ONLY_CONFIDENCE, "source", "auto_link")
        if by_name.taxonomy_node_id == source_leaf:
            return ClassificationResult(
                source_leaf, _SOURCE_NAME_AGREE_CONFIDENCE, "source_name", "auto_link"
            )
        # CONFLICTO: origen y nombre resuelven a hojas DISTINTAS. Hasta acá se abstenía siempre —
        # el 62% de las abstenciones (33 de 63 medidas el 2026-08-01).
        #
        # Revisadas una por una, la culpa suele ser de un INGREDIENTE en el nombre:
        #   `Acondicionador Aceite De Coco`  origen: Cuidado Capilar ✅  nombre: Aceite & Vinagre ❌
        #   `Galleta Arroz Ricecrisps`       origen: Galletas ✅         nombre: Arroz, Granos ❌
        # Pero NO siempre gana la fuente: `Vinagre De Arroz Okayama` tiene origen «Salsas» y nombre
        # «Aceite & Vinagre», y ahí acierta el nombre. Ninguna regla fija resuelve las dos.
        #
        # Es justo el trabajo de un juez: elegir entre DOS categorías que ya propuso una señal. No
        # inventa nada —arbitra entre candidatos existentes— y el piso de confianza rige igual que
        # en la banda gris. Sin juez, o sin nombres de hoja para formular la pregunta, se abstiene
        # como antes.
        return self._arbitrate_conflict(product, source_leaf, by_name.taxonomy_node_id)

    def _arbitrate_conflict(
        self, product: ClassifiableProduct, source_leaf: str, name_leaf: str
    ) -> ClassificationResult:
        if self._judge is None:
            return _CONFLICT

        # Se pregunta primero por la hoja del ORIGEN: es la estantería donde la propia tienda puso
        # el producto, y en los conflictos revisados acierta más seguido que el nombre.
        for hoja in (source_leaf, name_leaf):
            nombre_hoja = self._leaf_names.get(hoja)
            if not nombre_hoja:
                continue
            verdict = self._judge.judge(product, nombre_hoja)
            if (
                verdict is not None
                and verdict.decision == "match"
                and verdict.confidence >= JUDGE_MATCH_MIN_CONFIDENCE
            ):
                return ClassificationResult(hoja, verdict.confidence, "llm", "grey")
        return _CONFLICT

    def _match_source_path(self, source_category: str) -> tuple[str, float] | None:
        """Categoría de origen (path jerárquico) → hoja, segmento a segmento (hondo→general).
        Delega en `lexicon_match_path` (compartido con el matcher, Etapa C)."""
        return lexicon_match_path(source_category, self._lexicon)

    def _classify_by_name(
        self,
        product: ClassifiableProduct,
        market_id: str,
        evidence: "_Evidence | None" = None,
    ) -> ClassificationResult:
        """Cascada por NOMBRE (léxico → vector-con-margen → juez opcional). PURA: nunca persiste —
        devuelve la decisión para que `_decide` la cruce con la señal de origen y `execute` persista.

        Sin trgm/RRF (a diferencia del matching): medido (120 hojas × 30 productos), el trgm de
        categorías compara el nombre del producto contra el nombre de la HOJA — que no lleva los
        `classification_terms` — así que es ruido y contamina el consenso RRF (17% de precisión). El
        match literal de tokens que el trgm aportaría ya lo cubre el LÉXICO (Etapa 1). La señal que
        SÍ discrimina es el vector con la receta descriptiva; el banding es por MARGEN, no por score
        absoluto (`category_banding`). Ver esa doc para la evidencia."""
        # --- Etapa 1: léxico determinista ---
        if evidence is not None:
            # Se anotan SIEMPRE, no sólo cuando el léxico acierta: si pegaron DOS hojas el léxico se
            # abstiene por ambigüedad, y saber cuáles compitieron es justamente lo que explica esa
            # abstención.
            evidence.matched_tokens = matched_tokens(product.name, self._lexicon)
        hit = lexicon_match(product.name, self._lexicon)
        if hit is not None:
            leaf_id, confidence = hit
            return ClassificationResult(leaf_id, confidence, "lexicon", "auto_link")

        # --- Etapa 2: vector semántico, decisión por MARGEN ---
        # Sin modelo en este proceso NO se sigue: se deja sin clasificar, igual que la banda grey
        # con el juez apagado. Inventar acá sería peor que no responder, y reventar por
        # `None.embed(...)` convertiría "no tengo esa etapa" en "la consola está rota".
        # Medido sobre la cola real (48 filas): léxico + señal de origen resolvieron el 100%, así
        # que en la práctica esta rama es la excepción, no el camino normal.
        if self._embedder is None:
            return ClassificationResult(None, 0.0, "none", "grey")
        embedding = self._embedder.embed([product.name])[0]
        # `limit` más ancho cuando hay departamento: el filtro descarta la mayoría, y quedarse con
        # el top-5 GLOBAL podría no dejar ni una hoja del área (el vector de categorías viene
        # apiñado en ~0.47-0.49, así que el top-5 es casi arbitrario).
        department = self._department_of(product.source_category)
        vector = self._candidates.find_leaves_vector(
            embedding, market_id, limit=40 if department else 5
        )
        if department is not None:
            del_area = [c for c in vector if self._leaf_to_parent.get(c.taxonomy_node_id) == department]
            # Si el área no tiene NINGÚN candidato, se ignora el gate: el departamento es una AYUDA
            # y nunca puede dejar a un producto peor que si no lo tuviéramos. Pasa cuando la raíz
            # existe en la taxonomía pero el vector no propuso ninguna de sus hojas.
            vector = (del_area or vector)[:5]
        if evidence is not None:
            # El top-k con sus scores es lo que hace legible un `grey` a posteriori: sin él, saber
            # si el margen fue 0.001 o 0.029 exige volver a embeber el producto.
            evidence.vector_top = tuple(vector)
        winner_id, score, band = decide_by_vector_margin(vector)

        if band == "auto_link":
            return ClassificationResult(winner_id, score, "vector", "auto_link")

        if band == "grey":
            # Margen fino: el vector no destaca claro. Con el juez apagado
            # (`SAVE_LLM_JUDGE_ENABLED=false`, decisión de producto) NO se clasifica — no inventar
            # categoría (regla sagrada).
            if self._judge is None:
                return ClassificationResult(None, 0.0, "none", "grey")
            # Con el juez, se le pregunta por CADA candidato en orden de score hasta que uno pase el
            # piso. Preguntar sólo por `vector[0]` desperdiciaba la etapa: medido 2026-08-01 sobre
            # la cola real, en banda gris los candidatos vienen apiñados en coseno ~0.47-0.49 con
            # márgenes de milésimas, así que el orden entre ellos es casi ruido y la hoja correcta
            # cae fuera del top-1 a menudo. Si salía #2, el juez decía «no» al #1 y el producto
            # terminaba en «sin señal suficiente» sin que nadie le preguntara por la buena.
            #
            # El costo está acotado por el `limit` del vector (5) y por el corte al primer match; y
            # sólo se paga en banda gris, que es donde el determinismo ya se quedó sin respuesta.
            for candidate in vector:
                verdict = self._judge.judge(product, candidate.name)
                if (
                    verdict is not None
                    and verdict.decision == "match"
                    and verdict.confidence >= JUDGE_MATCH_MIN_CONFIDENCE
                ):
                    return ClassificationResult(
                        candidate.taxonomy_node_id, verdict.confidence, "llm", "grey"
                    )
            return ClassificationResult(None, 0.0, "none", "grey")

        # banda human (sin candidatos) → sin clasificar
        return _UNCLASSIFIED

    def _record(
        self,
        product: ClassifiableProduct,
        market_id: str,
        result: ClassificationResult,
        evidence: _Evidence,
    ) -> None:
        """Registra el evento de decisión. No-op sin recorder inyectado."""
        if self._decisions is None:
            return
        self._decisions.record(
            CategoryDecision(
                ref_id=product.ref_id,
                is_canonical=product.is_canonical,
                market_id=market_id,
                method=result.method,
                taxonomy_node_id=result.taxonomy_node_id,
                confidence=result.confidence,
                band=result.band,
                source_leaf_id=evidence.source_leaf_id,
                name_leaf_id=evidence.name_leaf_id,
                matched_tokens=evidence.matched_tokens,
                vector_top=evidence.vector_top,
            )
        )

    def _persist(
        self, product: ClassifiableProduct, leaf_id: str, confidence: float, method: str
    ) -> None:
        self._classifications.save_active(
            CategoryClassification(
                id=str(uuid.uuid4()),
                store_product_id=None if product.is_canonical else product.ref_id,
                canonical_product_id=product.ref_id if product.is_canonical else None,
                taxonomy_node_id=leaf_id,
                confidence=confidence,
                method=method,
                status="active",
            )
        )

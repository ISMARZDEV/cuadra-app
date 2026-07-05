"""Use case MatchStoreProduct (F2.0 §Cascade Contract): cascada de matching store_product ->
canonical_product. EAN exacto -> léxico (trgm) + semántico (vector) fusionados por RRF -> boosts
deterministas (marca/tamaño exactos) -> banding por umbral -> Claude-judge SOLO en banda gris ->
cola humana. `product_match` es la fuente de verdad del enlace (Sacred rule); el FK denormalizado
`store_product.canonical_product_id` se escribe SOLO junto con el `product_match` correspondiente
— este use case es el dueño de esa frontera transaccional (ver design), nunca un trigger de DB.

Gap de puertos (documentado, no se tocan Batches 1-6 ya cerrados): `domain/ports/repositories.py`
(Batch 2) expone `find_candidates_trgm`/`find_candidates_vector` pero NO una etapa EAN ni un
escritor del FK de store_product — se agregan aquí como extensiones LOCALES (`Protocol` que
extiende el puerto compartido) en vez de reabrir esos archivos. Candidato a formalizarse en el
puerto compartido en una batch futura de wiring (Batch 8) si el equipo lo confirma.

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

from ..domain.entities import MatchCandidate, ProductMatch
from ..domain.ports import CanonicalProductRepository, StoreProductRepository
from ..domain.ports.repositories import EmbeddingProvider, ProductMatchRepository
from ..infrastructure.matching.cascade.banding import determine_band
from ..infrastructure.matching.cascade.fusion import reciprocal_rank_fusion
from ..infrastructure.matching.cascade.scoring import apply_boosts


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

    def __post_init__(self) -> None:
        if not self.store_product_id.strip():
            raise ValueError("IncomingStoreProduct.store_product_id no puede estar vacío")
        if not self.name.strip():
            raise ValueError("IncomingStoreProduct.name no puede estar vacío")


class CascadeMatchRepository(ProductMatchRepository, Protocol):
    """Extiende `ProductMatchRepository` (domain/ports, Batch 2 ya cerrado) con la etapa EAN, que
    el puerto compartido aún no expone. Devuelve `MatchCandidate` para reusar el mismo tipo que
    trgm/vector; el use case decide colisión (>1 id distinto) vs match único (1 id) vs sin match
    (lista vacía)."""

    def find_candidates_by_ean(self, ean: str, market_id: str) -> list[MatchCandidate]:
        """canonical_product_id(s) DISTINTOS de store_products YA enlazados que comparten este
        EAN en el mercado, mejor-primero (aunque para EAN exacto no hay ranking real: o hay
        1 match, 0, o una colisión ambigua)."""
        ...


class CascadeStoreProductRepository(StoreProductRepository, Protocol):
    """Extiende `StoreProductRepository` (domain/ports, Batch 2 ya cerrado) con el escritor del
    FK denormalizado que la cascada necesita. Invariante de diseño: SOLO se llama junto al
    `record_match` correspondiente, dentro de la misma transacción — este use case llama a ambos
    contra la misma Session/UoW inyectada en producción, antes de que se confirme el commit."""

    def link_to_canonical(self, store_product_id: str, canonical_product_id: str) -> None:
        """Escribe (o reemplaza) `store_product.canonical_product_id`."""
        ...


class GreyBandJudge(Protocol):
    """Lo mínimo que el use case necesita del judge (ver `ClaudeJudge.judge`, Batch 6) — definido
    aquí (no en domain/ports) para no acoplar la aplicación al tipo concreto de infraestructura;
    duck-typing estructural: `ClaudeJudge` lo satisface sin heredar de nada."""

    def judge(self, *, store_product: dict, canonical_product: dict) -> _JudgeVerdictLike: ...


class _JudgeVerdictLike(Protocol):
    decision: str
    confidence: float
    cited_fields: list[str]


class MatchStoreProduct:
    """Cascada EAN -> trgm+vector (RRF) -> boosts -> banding -> judge (grey) -> revisión humana."""

    def __init__(
        self,
        *,
        match_repo: CascadeMatchRepository,
        store_repo: CascadeStoreProductRepository,
        canonical_repo: CanonicalProductRepository,
        embedding_provider: EmbeddingProvider,
        judge: GreyBandJudge,
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo
        self._canonical_repo = canonical_repo
        self._embedder = embedding_provider
        self._judge = judge

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
                return self._to_review(product, method="human", confidence=0.0)
            # 0 candidatos -> cae a la etapa léxica/semántica (EAN null se salta este bloque igual)

        # --- Etapa 2/3: léxico (trgm) + semántico (vector), fusionados por RRF ---
        trgm_candidates = self._match_repo.find_candidates_trgm(product.name, product.market_id)
        embedding_text = f"{product.name} {product.brand} {product.size}".strip()
        embedding = self._embedder.embed([embedding_text])[0]
        vector_candidates = self._match_repo.find_candidates_vector(embedding, product.market_id)

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
        band = determine_band(final_score)
        stage_method = "hybrid" if (in_trgm and in_vector) else ("trgm" if in_trgm else "vector")

        if band == "auto_link":
            return self._auto_link(product, winner_id, confidence=final_score, method=stage_method)

        if band == "grey":
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
            if verdict.decision == "match":
                return self._auto_link(product, winner_id, confidence=verdict.confidence, method="llm")
            return self._to_review(product, method="llm", confidence=verdict.confidence)

        # band == "human": score debajo de MID
        return self._to_review(product, method="human", confidence=final_score)

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
    def _exact_match(incoming: str, candidate: str | None) -> bool:
        if not candidate:
            return False
        return incoming.strip().casefold() == candidate.strip().casefold()

    def _auto_link(
        self, product: IncomingStoreProduct, canonical_product_id: str, *, confidence: float, method: str
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
        )
        return ProductMatch(
            store_product_id=product.store_product_id,
            canonical_product_id=canonical_product_id,
            confidence=confidence,
            method=method,  # type: ignore[arg-type]
            status="auto_linked",
        )

    def _to_review(
        self, product: IncomingStoreProduct, *, method: str, confidence: float
    ) -> ProductMatch:
        self._match_repo.record_match(
            store_product_id=product.store_product_id,
            canonical_product_id=None,
            confidence=confidence,
            method=method,
            status="pending_review",
        )
        return ProductMatch(
            store_product_id=product.store_product_id,
            canonical_product_id=None,
            confidence=confidence,
            method=method,  # type: ignore[arg-type]
            status="pending_review",
        )

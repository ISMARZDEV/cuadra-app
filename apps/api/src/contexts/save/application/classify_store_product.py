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
from collections import defaultdict

from ..domain.classification import (
    CategoryClassification,
    ClassifiableProduct,
    ClassificationResult,
)
from ..domain.ports.repositories import (
    CategoryCandidateRepository,
    CategoryClassificationRepository,
    CategoryJudgePort,
    EmbeddingProvider,
)
from ..infrastructure.classification.lexicon import LexiconIndex, lexicon_match
from ..infrastructure.matching.cascade.banding import (
    JUDGE_MATCH_MIN_CONFIDENCE,
    determine_band,
)

_RRF_K = 60

_UNCLASSIFIED = ClassificationResult(taxonomy_node_id=None, confidence=0.0, method="none", band="human")


def _rrf_winner(*ranked_lists) -> str | None:  # type: ignore[no-untyped-def]
    """Ganador por consenso RRF sobre las hojas candidatas (por taxonomy_node_id)."""
    scores: dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, candidate in enumerate(ranked, start=1):
            scores[candidate.taxonomy_node_id] += 1.0 / (_RRF_K + rank)
    if not scores:
        return None
    return max(scores, key=lambda k: scores[k])


def _winner_view(node_id, *ranked_lists):  # type: ignore[no-untyped-def]
    """(mejor score crudo, nombre, en_trgm, en_vector) del ganador entre las listas."""
    best_score, name, in_trgm, in_vector = 0.0, "", False, False
    for ranked in ranked_lists:
        for candidate in ranked:
            if candidate.taxonomy_node_id != node_id:
                continue
            best_score = max(best_score, candidate.score)
            name = name or candidate.name
            in_trgm = in_trgm or candidate.source == "trgm"
            in_vector = in_vector or candidate.source == "vector"
    return best_score, name, in_trgm, in_vector


class ClassifyStoreProduct:
    def __init__(
        self,
        classifications: CategoryClassificationRepository,
        candidates: CategoryCandidateRepository,
        embedder: EmbeddingProvider,
        judge: CategoryJudgePort,
        lexicon_index: LexiconIndex,
    ) -> None:
        self._classifications = classifications
        self._candidates = candidates
        self._embedder = embedder
        self._judge = judge
        self._lexicon = lexicon_index

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

        # --- Etapa 1: léxico determinista ---
        hit = lexicon_match(product.name, self._lexicon)
        if hit is not None:
            leaf_id, confidence = hit
            self._persist(product, leaf_id, confidence, "lexicon")
            return ClassificationResult(leaf_id, confidence, "lexicon", "auto_link")

        # --- Etapa 2/3: trgm + vector, consenso por RRF ---
        trgm = self._candidates.find_leaves_trgm(product.name, market_id, limit=5)
        embedding = self._embedder.embed([product.name])[0]
        vector = self._candidates.find_leaves_vector(embedding, market_id, limit=5)

        winner_id = _rrf_winner(trgm, vector)
        if winner_id is None:
            return _UNCLASSIFIED

        raw_score, winner_name, in_trgm, in_vector = _winner_view(winner_id, trgm, vector)
        method = "hybrid" if (in_trgm and in_vector) else ("trgm" if in_trgm else "vector")
        band = determine_band(raw_score)

        if band == "auto_link":
            self._persist(product, winner_id, raw_score, method)
            return ClassificationResult(winner_id, raw_score, method, "auto_link")

        if band == "grey":
            verdict = self._judge.judge(product, winner_name)
            if verdict.decision == "match" and verdict.confidence >= JUDGE_MATCH_MIN_CONFIDENCE:
                self._persist(product, winner_id, verdict.confidence, "llm")
                return ClassificationResult(winner_id, verdict.confidence, "llm", "grey")
            # match débil o uncertain → sin clasificar (no inventa)
            return ClassificationResult(None, 0.0, "none", "grey")

        # banda human → sin clasificar
        return _UNCLASSIFIED

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

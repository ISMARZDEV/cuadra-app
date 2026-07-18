"""Unit — banding PROPIO del clasificador (save-category-classification). PURO.

Distinto del banding del matching (`determine_band`, umbrales 0.85/0.55 producto↔producto). Acá la
comparación es producto↔hoja-de-taxonomía: medido (120 hojas, 30 productos), los scores del acierto
viven en 0.41–0.61 y SE SOLAPAN con los fallos → un umbral de score absoluto no separa. Lo que SÍ
separa es el MARGEN del vector (top1−top2): con margen ≥ 0.03, la etapa fuzzy dio 100% de precisión.
RRF/trgm se DESCARTAN para clasificar (el trgm de categorías no ve los términos → 17% precisión).
"""
from __future__ import annotations

from src.contexts.save.domain.classification import CategoryCandidate
from src.contexts.save.infrastructure.classification.category_banding import (
    CATEGORY_MARGIN_THRESHOLD,
    decide_by_vector_margin,
)


def _c(node_id: str, score: float) -> CategoryCandidate:
    return CategoryCandidate(taxonomy_node_id=node_id, name=node_id, score=score, source="vector")


def test_clear_margin_auto_links_the_vector_winner() -> None:
    winner_id, score, band = decide_by_vector_margin([_c("a", 0.55), _c("b", 0.40)])
    assert winner_id == "a"
    assert band == "auto_link"
    assert score == 0.55


def test_thin_margin_does_not_auto_link() -> None:
    # 0.50 vs 0.49 = margen 0.01 < umbral → banda gris (sin juez = sin clasificar)
    winner_id, _score, band = decide_by_vector_margin([_c("a", 0.50), _c("b", 0.49)])
    assert winner_id is None
    assert band == "grey"


def test_single_candidate_auto_links_margin_is_full_score() -> None:
    winner_id, _score, band = decide_by_vector_margin([_c("a", 0.42)])
    assert winner_id == "a"
    assert band == "auto_link"


def test_no_candidates_goes_to_human() -> None:
    winner_id, score, band = decide_by_vector_margin([])
    assert winner_id is None
    assert score == 0.0
    assert band == "human"


def test_margin_exactly_at_threshold_auto_links() -> None:
    winner_id, _score, band = decide_by_vector_margin(
        [_c("a", 0.50), _c("b", 0.50 - CATEGORY_MARGIN_THRESHOLD)]
    )
    assert winner_id == "a"
    assert band == "auto_link"

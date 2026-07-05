"""Unit — boost determinístico del score fusionado (marca/tamaño exactos) F2.0. PURA, sin DB."""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.scoring import (
    BRAND_EXACT_MATCH_BOOST,
    SIZE_EXACT_MATCH_BOOST,
    apply_boosts,
)


def test_no_boost_returns_baseline_score() -> None:
    assert apply_boosts(0.5) == 0.5


def test_brand_exact_match_raises_score_above_baseline() -> None:
    boosted = apply_boosts(0.5, brand_exact_match=True)

    assert boosted == 0.5 + BRAND_EXACT_MATCH_BOOST
    assert boosted > 0.5


def test_size_exact_match_raises_score_above_baseline() -> None:
    boosted = apply_boosts(0.5, size_exact_match=True)

    assert boosted == 0.5 + SIZE_EXACT_MATCH_BOOST
    assert boosted > 0.5


def test_combined_boosts_are_clamped_to_one() -> None:
    boosted = apply_boosts(0.95, brand_exact_match=True, size_exact_match=True)

    assert boosted == 1.0

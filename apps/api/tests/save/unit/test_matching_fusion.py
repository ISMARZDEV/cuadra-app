"""Unit — fusión RRF (Reciprocal Rank Fusion) de candidatos de matching (F2.0). PURA, sin DB."""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import MatchCandidate
from src.contexts.save.infrastructure.matching.cascade.fusion import (
    DEFAULT_RRF_K,
    reciprocal_rank_fusion,
)


def _candidates(*ids: str) -> list[MatchCandidate]:
    # El score crudo por etapa es irrelevante para RRF (que fusiona por RANK/posición, no por score).
    return [MatchCandidate(canonical_product_id=cid, score=0.0) for cid in ids]


def test_item_in_both_lists_ranks_higher_than_item_in_one_list() -> None:
    trgm = _candidates("cpA", "cpB")
    vector = _candidates("cpA", "cpC")

    fused = reciprocal_rank_fusion(trgm, vector)

    ranked_ids = [c.canonical_product_id for c in fused]
    assert ranked_ids[0] == "cpA"
    assert ranked_ids.index("cpA") < ranked_ids.index("cpB")
    assert ranked_ids.index("cpA") < ranked_ids.index("cpC")


def test_empty_lists_return_empty_fusion() -> None:
    assert reciprocal_rank_fusion([], []) == []


def test_default_k_is_60_and_score_matches_rrf_formula() -> None:
    trgm = _candidates("cpA")
    vector: list[MatchCandidate] = []

    fused = reciprocal_rank_fusion(trgm, vector)

    assert DEFAULT_RRF_K == 60
    assert fused[0].score == pytest.approx(1.0 / (60 + 1))


def test_custom_k_changes_the_fused_score() -> None:
    trgm = _candidates("cpA")

    fused = reciprocal_rank_fusion(trgm, k=10)

    assert fused[0].score == pytest.approx(1.0 / (10 + 1))

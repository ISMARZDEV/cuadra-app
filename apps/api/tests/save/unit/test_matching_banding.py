"""Unit — banding por umbral del score final (auto_link/grey/human) F2.0. PURA, sin DB."""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.banding import (
    MATCH_HIGH_THRESHOLD,
    MATCH_MID_THRESHOLD,
    determine_band,
)


def test_score_at_high_threshold_is_auto_link() -> None:
    assert MATCH_HIGH_THRESHOLD == 0.85
    assert determine_band(0.85) == "auto_link"


def test_score_above_high_threshold_is_auto_link() -> None:
    assert determine_band(0.95) == "auto_link"


def test_score_at_mid_threshold_is_grey() -> None:
    assert MATCH_MID_THRESHOLD == 0.55
    assert determine_band(0.55) == "grey"


def test_score_between_mid_and_high_is_grey() -> None:
    assert determine_band(0.70) == "grey"


def test_score_just_below_mid_threshold_is_human() -> None:
    assert determine_band(0.549) == "human"


def test_score_none_from_empty_candidates_is_human() -> None:
    assert determine_band(None) == "human"

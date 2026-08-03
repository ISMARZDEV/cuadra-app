"""Unit — ¿la consulta identifica un producto o una familia? DOMINIO PURO.

Los números de cada caso salen de medir contra la base real, no de inventarlos.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.search_ambiguity import is_ambiguous


class TestConsultasAmbiguas:
    @pytest.mark.parametrize(
        ("query", "scores"),
        [
            ("arroz", [1.0] * 10),
            ("aceite", [1.0] * 6),
            ("leche", [1.0] * 6),
            ("habichuelas", [1.0] * 10),
        ],
    )
    def test_a_word_that_matches_many_products_perfectly_is_ambiguous(
        self, query: str, scores: list[float]
    ) -> None:
        """Nada de lo que el usuario dijo distingue entre los candidatos."""
        assert is_ambiguous(scores) is True


class TestConsultasEspecificas:
    def test_a_single_candidate_is_never_ambiguous(self) -> None:
        assert is_ambiguous([0.737]) is False

    def test_two_candidates_are_not_worth_a_turn(self) -> None:
        assert is_ambiguous([0.714, 0.357]) is False

    def test_a_top_hit_below_perfect_already_discriminates(self) -> None:
        """«arroz campos 20 lb»: 10 candidatos y ratio 0.972, pero el mejor NO es exacto."""
        assert is_ambiguous([0.704, 0.684, 0.680] + [0.5] * 7) is False

    def test_a_clear_winner_among_many_is_not_ambiguous(self) -> None:
        assert is_ambiguous([1.0, 0.6, 0.55, 0.5]) is False


class TestBordes:
    def test_no_candidates_is_not_ambiguous(self) -> None:
        assert is_ambiguous([]) is False

    def test_a_hair_below_the_tie_still_counts_as_tied(self) -> None:
        assert is_ambiguous([1.0, 0.996, 0.996]) is True

    def test_a_visible_gap_breaks_the_tie(self) -> None:
        assert is_ambiguous([1.0, 0.98, 0.97]) is False

    def test_all_zero_scores_do_not_divide_by_zero(self) -> None:
        assert is_ambiguous([0.0, 0.0, 0.0]) is False

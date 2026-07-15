"""Unit — selección del mejor candidato para un canónico OBJETIVO (Loop B cobertura dirigida, PURO).

Fix del hallazgo live 2026-07-12: Loop B ingestaba los ~65 resultados de la búsqueda dirigida y
matcheaba cada uno contra CUALQUIER canónico → el objetivo se cubría por casualidad (1/23). Ahora
selecciona el ÚNICO mejor candidato PARA el objetivo (EAN-exacto → o mayor similitud trigram) y solo
ESE pasa a la cascada. Sin red ni DB.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.contexts.save.domain.candidate_selection import (
    select_best_candidate,
    trigram_similarity,
)


@dataclass(frozen=True)
class _Cand:
    name: str
    ean: str | None = None


def test_trigram_similarity_identical_is_1() -> None:
    assert trigram_similarity("arroz la garza", "arroz la garza") == 1.0


def test_trigram_similarity_unrelated_is_low() -> None:
    assert trigram_similarity("guandules goya", "azucar crema") < 0.3


def test_trigram_similarity_is_case_insensitive() -> None:
    assert trigram_similarity("Arroz LA Garza", "arroz la garza") == 1.0


def test_prefers_ean_exact_over_name_similarity() -> None:
    # Aunque otro candidato tenga el nombre más parecido, el EAN exacto del objetivo gana.
    cands = [
        _Cand("Arroz La Garza Premium 20 Lb", ean=None),
        _Cand("otra cosa distinta", ean="7460083780023"),
    ]
    best = select_best_candidate(
        target_name="Arroz La Garza Premium 20 Lb",
        target_ean="7460083780023",
        candidates=cands,
    )
    assert best is cands[1]


def test_picks_highest_trigram_when_no_ean() -> None:
    cands = [
        _Cand("Azucar Crema Blanca"),
        _Cand("Guandules Verdes Goya 15.5 Oz"),
        _Cand("Cafe Santo Domingo"),
    ]
    best = select_best_candidate(
        target_name="Guandules Verdes Con Coco Goya 15.5 Oz",
        target_ean=None,
        candidates=cands,
    )
    assert best is cands[1]


def test_returns_none_when_all_below_floor() -> None:
    # Solo ruido (nada parecido al objetivo) → no se ingesta nada (deja el canónico sin cubrir).
    cands = [_Cand("Azucar Crema"), _Cand("Cafe Molido")]
    best = select_best_candidate(
        target_name="Guandules Verdes Con Coco Goya",
        target_ean=None,
        candidates=cands,
    )
    assert best is None


def test_returns_none_on_empty() -> None:
    assert select_best_candidate(target_name="x", target_ean=None, candidates=[]) is None

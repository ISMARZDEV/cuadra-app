"""Unit — la constante del seed del piloto de canasta. Los seeds no los importa ningún otro test;
este da al menos cobertura de import + del contenido de `PILOT_QUERIES` (un typo se ve acá)."""
from __future__ import annotations

from seeds.save_basket_pilot import PILOT_QUERIES


def test_pilot_queries_are_the_five_rice_and_legume_queries() -> None:
    assert PILOT_QUERIES == (
        "arroz selecto",
        "arroz la garza",
        "guandules verdes",
        "habichuelas pintas",
        "habichuelas rojas la famosa",
    )


def test_pilot_queries_have_no_duplicates() -> None:
    assert len(set(PILOT_QUERIES)) == len(PILOT_QUERIES)

"""Unit — normalize_size_text (display canónico de tamaños). PURO, sin DB.

Canonicaliza la ORTOGRAFÍA de la unidad a un token de 2 letras (Lb, Gr, Kg, Oz, Ml, Lt, Gl, Un) y
los descriptores de talla a 1 letra (Grande=G, Mediana=M, Pequeña=P). NO convierte de unidad — "20
Lbs" queda "20 Lb", NO se pasa a kg. Desconocido → el texto tal cual (nunca inventa).
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.value_objects import normalize_size_text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("20 Lbs", "20 Lb"),
        ("20 LB", "20 Lb"),
        ("1 Lb", "1 Lb"),
        ("500 gramos", "500 Gr"),
        ("500 g", "500 Gr"),
        ("2.0 Kg", "2 Kg"),
        ("1,5 L", "1.5 Lt"),
        ("750 ml", "750 Ml"),
        ("24 Oz", "24 Oz"),
        ("24 onzas", "24 Oz"),
        ("1 galon", "1 Gl"),
        ("6 unidades", "6 Un"),
    ],
)
def test_normalizes_unit_spelling_to_two_letters(raw: str, expected: str) -> None:
    assert normalize_size_text(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Grande", "G"), ("grande", "G"), ("Mediana", "M"), ("mediano", "M"), ("Pequeña", "P")],
)
def test_descriptors_to_one_letter(raw: str, expected: str) -> None:
    assert normalize_size_text(raw) == expected


def test_unknown_or_empty_left_as_is() -> None:
    assert normalize_size_text("Combo especial") == "Combo especial"  # no parseable → tal cual
    assert normalize_size_text("10 xyz") == "10 xyz"  # unidad desconocida → tal cual
    assert normalize_size_text(None) is None
    assert normalize_size_text("") == ""

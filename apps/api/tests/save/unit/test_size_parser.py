"""Unit — parser de tamaños (§6.2): "5lb" / "64 OZ" / "12x330ml" → Quantity en unidad base.

Convierte el string de tamaño del catálogo (VTEX/Magento) a una `Quantity` normalizada
(kg / L / und) para poder comparar precio por unidad base. Tolera mayúsculas, decimales con
coma, abreviaturas dominicanas (LB, LT, GR, GL, UND, OZ, ML) y multipacks (NxM).

Nota de diseño: `OZ` se trata como MASA por defecto (onza-peso). La onza fluida (volumen) es
ambigua sin contexto de producto; como la comparación es SIEMPRE dentro de la misma medida y el
mismo producto se parsea igual en toda tienda, la comparación cross-tienda se mantiene válida.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.domain.value_objects.size_parser import parse_size


def test_pounds_to_kilograms() -> None:
    q = parse_size("5lb")
    assert q.measure == UnitMeasure.MASS
    assert q.amount == Decimal("2.26796185")  # 5 * 0.45359237


def test_uppercase_and_spaces() -> None:
    assert parse_size("10 LB") == Quantity(Decimal("4.5359237"), UnitMeasure.MASS)


def test_grams_to_kilograms() -> None:
    assert parse_size("500 GR") == Quantity(Decimal("0.5"), UnitMeasure.MASS)


def test_liters_and_ml() -> None:
    assert parse_size("1 LT") == Quantity(Decimal("1"), UnitMeasure.VOLUME)
    assert parse_size("200 ML") == Quantity(Decimal("0.2"), UnitMeasure.VOLUME)


def test_gallon_to_liters() -> None:
    assert parse_size("1 GL") == Quantity(Decimal("3.78541"), UnitMeasure.VOLUME)


def test_ounces_default_to_mass() -> None:
    q = parse_size("64 OZ")
    assert q.measure == UnitMeasure.MASS
    assert q.amount == Decimal("1.81436948")  # 64 * 0.028349523125


def test_count_units() -> None:
    assert parse_size("30 UND") == Quantity(Decimal("30"), UnitMeasure.COUNT)


def test_decimal_with_comma() -> None:
    assert parse_size("1,5 LT") == Quantity(Decimal("1.5"), UnitMeasure.VOLUME)


def test_multipack_multiplies_inner() -> None:
    # 12 x 330ml = 3.96 L
    assert parse_size("12x330ml") == Quantity(Decimal("3.96"), UnitMeasure.VOLUME)


def test_plural_pounds_lbs() -> None:
    # "10 Lbs" (plural) — visto en datos reales de Sirena (Arroz Pimco 10 Lbs)
    assert parse_size("10 Lbs") == Quantity(Decimal("4.5359237"), UnitMeasure.MASS)


def test_onz_abbreviation_to_mass() -> None:
    # "3.5 Onz" — abreviatura vista en datos reales de Jumbo (Rollo Crujiente ... 3.5 Onz)
    q = parse_size("3.5 Onz")
    assert q.measure == UnitMeasure.MASS
    assert q.amount == Decimal("0.0992233309375")  # 3.5 * 0.028349523125


def test_unparseable_raises() -> None:
    with pytest.raises(ValueError):
        parse_size("gigante")
    with pytest.raises(ValueError):
        parse_size("5 zzz")

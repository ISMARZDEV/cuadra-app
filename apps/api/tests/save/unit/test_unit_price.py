"""Unit — money-math de Save (§6.2): precio por UNIDAD BASE (RD$/kg, RD$/L, RD$/und).

Es la ÚNICA comparación justa entre productos de distinto tamaño. Regla sagrada (§12·B):
el precio se calcula en ENTEROS (minor units), nunca float. RED-first (ADR 5): ningún
cálculo de dinero se escribe sin un test que lo cubra primero.

`Quantity` va SIEMPRE en unidad base (kg / L / unidad); el parseo de "5lb"→kg es otra tarea.
`unit_price(price, quantity)` = price / cantidad_base, redondeo half-up a minor units.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.domain.value_objects.units import (
    Quantity,
    UnitMeasure,
    UnitPrice,
    unit_price,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


def test_quantity_rejects_non_positive_amount() -> None:
    with pytest.raises(ValueError):
        Quantity(Decimal("0"), UnitMeasure.MASS)
    with pytest.raises(ValueError):
        Quantity(Decimal("-1"), UnitMeasure.VOLUME)


def test_unit_price_per_kilogram() -> None:
    # RD$100.00 (10000 minor) por 2 kg → RD$50.00/kg (5000 minor)
    up = unit_price(_dop(10000), Quantity(Decimal("2"), UnitMeasure.MASS))
    assert up == UnitPrice(5000, DOP, UnitMeasure.MASS)


def test_unit_price_rounds_half_up() -> None:
    # RD$100.00 (10000) / 3 und = 3333.33 → 3333 minor/und (half-up)
    up = unit_price(_dop(10000), Quantity(Decimal("3"), UnitMeasure.COUNT))
    assert up.amount_minor == 3333
    assert up.measure == UnitMeasure.COUNT
    assert up.currency == DOP


def test_unit_price_carries_currency_and_measure() -> None:
    up = unit_price(_dop(5000), Quantity(Decimal("4"), UnitMeasure.VOLUME))
    assert up.amount_minor == 1250  # RD$50.00 / 4 L = RD$12.50/L
    assert up.currency == DOP
    assert up.measure == UnitMeasure.VOLUME


def test_cheaper_per_base_unit_is_lower() -> None:
    # mismo producto, distinto tamaño: el de menor precio/kg es más barato de verdad
    a = unit_price(_dop(16900), Quantity(Decimal("2"), UnitMeasure.MASS))  # 8450/kg
    b = unit_price(_dop(20000), Quantity(Decimal("2.5"), UnitMeasure.MASS))  # 8000/kg
    assert b.amount_minor < a.amount_minor

"""Unit — domain service compare() (§6.3): tabla comparativa de precios entre tiendas.

Dado un producto canónico (con su tamaño) y sus cotizaciones por tienda, ordena por precio,
marca la más barata ("Mejor precio") y calcula cuánto MÁS caro es cada otra ("+RD$14 más caro"),
+ el precio por unidad base de cada una. Es exactamente la tabla de SupermercadosRD.
Money-math en enteros (§12·B), RED-first.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.domain.comparison import StoreQuote, compare
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure, UnitPrice
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USD = Currency("USD")
TWO_KG = Quantity(Decimal("2"), UnitMeasure.MASS)


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


def _quotes() -> list[StoreQuote]:
    # desordenadas a propósito
    return [
        StoreQuote("p-sirena", "Sirena", _dop(47500)),   # RD$475.00
        StoreQuote("p-merca", "Merca", _dop(42400)),     # RD$424.00 (más barata)
        StoreQuote("p-bravo", "Bravo", _dop(43800)),     # RD$438.00
    ]


def test_requires_at_least_one_quote() -> None:
    with pytest.raises(ValueError):
        compare(TWO_KG, [])


def test_orders_by_price_and_marks_cheapest() -> None:
    result = compare(TWO_KG, _quotes())
    assert [e.provider_id for e in result.entries] == ["p-merca", "p-bravo", "p-sirena"]
    assert result.entries[0].is_cheapest is True
    assert all(not e.is_cheapest for e in result.entries[1:])


def test_extra_vs_cheapest() -> None:
    result = compare(TWO_KG, _quotes())
    extras = {e.provider_id: e.extra_vs_cheapest for e in result.entries}
    assert extras["p-merca"] == _dop(0)
    assert extras["p-bravo"] == _dop(1400)   # +RD$14.00
    assert extras["p-sirena"] == _dop(5100)  # +RD$51.00


def test_unit_price_per_entry() -> None:
    result = compare(TWO_KG, _quotes())
    cheapest = result.entries[0]
    assert cheapest.unit_price == UnitPrice(21200, DOP, UnitMeasure.MASS)  # 42400/2kg


def test_cheapest_most_expensive_and_spread() -> None:
    result = compare(TWO_KG, _quotes())
    assert result.cheapest.provider_id == "p-merca"
    assert result.most_expensive.provider_id == "p-sirena"
    assert result.spread == _dop(5100)  # 475 - 424


def test_mixed_currency_raises() -> None:
    with pytest.raises(ValueError):
        compare(TWO_KG, [StoreQuote("a", "A", _dop(1000)), StoreQuote("b", "B", Money(1000, USD))])

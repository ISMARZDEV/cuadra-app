"""Unit — detección de bajadas de precio (G4, doc 04): dominio puro sobre pares de cambio.

La infra entrega `PriceChange` (par consecutivo previous→current por store_product, SQL LAG);
el dominio clasifica: bajada = current < previous EN LA MISMA moneda. La magnitud va en
enteros: `drop` (Money) y `drop_bps` (básis points, //), sin float (§12·B). Un par con monedas
distintas NO es comparable → se descarta (nunca inventar una conversión).
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.domain.drops import PriceChange, detect_drops
from src.contexts.save.domain.entities import PriceType
from src.shared.money import Currency, Money

DOP = Currency("DOP")
WHEN = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)


def _change(prev_minor: int, curr_minor: int, currency: Currency = DOP) -> PriceChange:
    return PriceChange(
        canonical_product_id="c1",
        product_name="Arroz La Garza 10 Lbs",
        provider_id="p-jumbo",
        provider_name="Jumbo",
        previous=Money(prev_minor, currency),
        current=Money(curr_minor, currency),
        captured_at=WHEN,
        price_type=PriceType.ONLINE,
    )


def test_detects_drop_with_exact_integer_math() -> None:
    drops = detect_drops([_change(47500, 45000)])
    assert len(drops) == 1
    drop = drops[0]
    assert drop.drop == Money(2500, DOP)
    assert drop.drop_bps == 526  # 2500 * 10000 // 47500 — enteros, sin float
    assert drop.change.provider_name == "Jumbo"
    assert drop.change.price_type == PriceType.ONLINE


def test_ignores_rises_and_equal_prices() -> None:
    assert detect_drops([_change(44000, 45495)]) == []  # subida
    assert detect_drops([_change(44000, 44000)]) == []  # sin cambio


def test_skips_mixed_currency_pairs() -> None:
    mixed = PriceChange(
        canonical_product_id="c1",
        product_name="X",
        provider_id="p",
        provider_name="P",
        previous=Money(10000, DOP),
        current=Money(9000, Currency("USD")),  # no comparable: jamás convertir
        captured_at=WHEN,
        price_type=PriceType.ONLINE,
    )
    assert detect_drops([mixed]) == []


def test_sorts_biggest_relative_drop_first() -> None:
    small = _change(47500, 45000)   # 526 bps
    big = _change(40000, 30000)     # 2500 bps
    drops = detect_drops([small, big])
    assert [d.drop_bps for d in drops] == [2500, 526]

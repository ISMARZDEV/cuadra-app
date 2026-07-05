"""Unit — GetPriceHistory (C9, doc 04): series de precio por supermercado para el chart 1M/3M/Todos.

La tabla `price` es change-only (doc 10): guarda PUNTOS DE CAMBIO, no un punto por día. Por eso
la ventana 1M/3M debe incluir el BASELINE carry-in: el último cambio ANTERIOR al inicio de la
ventana (el precio vigente al arrancar el chart). Sin él, un precio estable 6 meses daría una
serie vacía en "1M" aunque el producto tenga precio actual. Fakes puros, sin DB.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.application.history import GetPriceHistory
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.history import PricePoint
from src.shared.money import Currency, Money

DOP = Currency("DOP")
NOW = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)


def _pt(provider: str, minor: int, when: datetime) -> PricePoint:
    return PricePoint(
        provider_id=f"id-{provider}",
        provider_name=provider,
        price=Money(minor, DOP),
        captured_at=when,
        price_type=PriceType.ONLINE,
    )


class FakeCanonicalRepo:
    def __init__(self, found: bool = True) -> None:
        self._found = found

    def get_by_id(self, product_id: str):  # type: ignore[no-untyped-def]
        if not self._found:
            return None
        from decimal import Decimal

        from src.contexts.save.domain.entities import CanonicalProduct
        from src.contexts.save.domain.value_objects import Quantity, UnitMeasure

        return CanonicalProduct(
            product_id, "Arroz La Garza", "La Garza",
            Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=None, market_id="DO",
        )


class FakeStoreRepo:
    def __init__(self, points: list[PricePoint]) -> None:
        self._points = points

    def list_price_history(self, canonical_product_id: str) -> list[PricePoint]:
        return self._points


def test_groups_points_into_series_per_provider() -> None:
    points = [
        _pt("Jumbo", 44000, datetime(2026, 5, 1, tzinfo=timezone.utc)),
        _pt("Jumbo", 45495, datetime(2026, 6, 20, tzinfo=timezone.utc)),
        _pt("Sirena", 47500, datetime(2026, 6, 1, tzinfo=timezone.utc)),
    ]
    dto = GetPriceHistory(FakeCanonicalRepo(), FakeStoreRepo(points)).execute(
        "c1", range_="all", now=NOW
    )
    assert dto.canonical_product_id == "c1"
    assert dto.name == "Arroz La Garza"
    assert dto.currency == "DOP"
    assert dto.range == "all"
    by_name = {s.provider_name: s for s in dto.series}
    assert set(by_name) == {"Jumbo", "Sirena"}
    assert [p.price_minor for p in by_name["Jumbo"].points] == [44000, 45495]
    assert by_name["Jumbo"].points[0].price_type == "online"


def test_window_includes_carry_in_baseline() -> None:
    # cambio VIEJO (feb) sigue vigente al abrir la ventana 1M → debe entrar como baseline
    points = [
        _pt("Jumbo", 42000, datetime(2026, 1, 10, tzinfo=timezone.utc)),  # superado antes de la ventana
        _pt("Jumbo", 44000, datetime(2026, 2, 1, tzinfo=timezone.utc)),   # baseline vigente
        _pt("Jumbo", 45495, datetime(2026, 6, 20, tzinfo=timezone.utc)),  # dentro de 1M
    ]
    dto = GetPriceHistory(FakeCanonicalRepo(), FakeStoreRepo(points)).execute(
        "c1", range_="1m", now=NOW
    )
    jumbo = dto.series[0]
    assert [p.price_minor for p in jumbo.points] == [44000, 45495]  # baseline + cambio en ventana


def test_window_3m_filters_older_points() -> None:
    points = [
        _pt("Sirena", 46000, datetime(2025, 12, 1, tzinfo=timezone.utc)),
        _pt("Sirena", 47000, datetime(2026, 5, 1, tzinfo=timezone.utc)),   # dentro de 3M
        _pt("Sirena", 47500, datetime(2026, 6, 25, tzinfo=timezone.utc)),  # dentro de 3M
    ]
    dto = GetPriceHistory(FakeCanonicalRepo(), FakeStoreRepo(points)).execute(
        "c1", range_="3m", now=NOW
    )
    # 46000 entra solo como baseline (vigente al inicio de la ventana)
    assert [p.price_minor for p in dto.series[0].points] == [46000, 47000, 47500]


def test_stable_price_yields_baseline_only() -> None:
    # precio sin cambios hace 6 meses → la serie 1M NO queda vacía: trae el baseline
    points = [_pt("Jumbo", 44000, datetime(2026, 1, 1, tzinfo=timezone.utc))]
    dto = GetPriceHistory(FakeCanonicalRepo(), FakeStoreRepo(points)).execute(
        "c1", range_="1m", now=NOW
    )
    assert [p.price_minor for p in dto.series[0].points] == [44000]


def test_missing_canonical_raises() -> None:
    with pytest.raises(CanonicalProductNotFoundError):
        GetPriceHistory(FakeCanonicalRepo(found=False), FakeStoreRepo([])).execute(
            "nope", range_="all", now=NOW
        )


def test_no_points_uses_market_currency_and_empty_series() -> None:
    dto = GetPriceHistory(FakeCanonicalRepo(), FakeStoreRepo([])).execute(
        "c1", range_="all", now=NOW
    )
    assert dto.series == []
    assert dto.currency == "DOP"  # fallback: moneda primaria del mercado del canónico

"""Unit — RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados.

Slice de F1: la fuente (adapter) entrega RawCatalogEntry y el use case registra la observación
SOLO para store_products conocidos por (provider, external_id) — el alta de productos nuevos
es del matching (F2). Pasa canonical_product_id=None: record_observation NO toca el link
canónico en refresh (solo lo usa al crear). Fakes puros, sin red ni DB.
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices, RefreshResult
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _entry(external_id: str, minor: int) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-sirena",
        market_id="DO",
        external_id=external_id,
        name="Arroz La Garza 10 Lbs",
        brand="LA GARZA",
        size_text="10 Lbs",
        price=Money(minor, DOP),
        price_type=PriceType.ONLINE,
        source="vtex",
        url="https://www.sirena.do/arroz-la-garza-10-lbs/p",
        ean="123",
    )


class FakeStoreRepo:
    def __init__(self, known: set[tuple[str, str]]) -> None:
        self._known = known
        self.observations: list[dict] = []

    def exists(self, provider_id: str, external_id: str) -> bool:
        return (provider_id, external_id) in self._known

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        self.observations.append(kwargs)
        return "sp-1"


class FakeSource:
    def __init__(self, entries: list[RawCatalogEntry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        yield from self._entries


def test_refreshes_only_known_products() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "14210")})
    source = FakeSource([_entry("14210", 47500), _entry("99999", 10000)])

    result = RefreshCatalogPrices(repo).execute(source)

    assert result == RefreshResult(seen=2, refreshed=1, unmatched=1)
    assert len(repo.observations) == 1
    obs = repo.observations[0]
    assert obs["provider_id"] == "p-sirena"
    assert obs["external_id"] == "14210"
    assert obs["canonical_product_id"] is None  # refresh: NO toca el link canónico
    assert obs["price"] == Money(47500, DOP)
    assert obs["price_type"] == PriceType.ONLINE
    assert obs["source"] == "vtex"
    assert obs["url"] == "https://www.sirena.do/arroz-la-garza-10-lbs/p"
    assert obs["ean"] == "123"


def test_captured_at_is_injectable_and_shared_by_run() -> None:
    ts = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)
    repo = FakeStoreRepo(known={("p-sirena", "a"), ("p-sirena", "b")})
    source = FakeSource([_entry("a", 100), _entry("b", 200)])

    RefreshCatalogPrices(repo).execute(source, captured_at=ts)

    assert [o["captured_at"] for o in repo.observations] == [ts, ts]


def test_empty_source_yields_zero_counts() -> None:
    repo = FakeStoreRepo(known=set())
    result = RefreshCatalogPrices(repo).execute(FakeSource([]))
    assert result == RefreshResult(seen=0, refreshed=0, unmatched=0)

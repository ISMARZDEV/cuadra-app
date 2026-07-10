"""Unit — enganche inline del clasificador en RefreshCatalogPrices (save-category-classification, Batch 10).

- flag ON (classifier inyectado): clasifica el store_product tras materializarlo, en el camino
  nuevo (con matcher) Y en el camino refresh (conocido).
- flag OFF (classifier=None): comportamiento idéntico a hoy (cero llamadas, cero regresión).
"""
from __future__ import annotations

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _entry(external_id: str) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-sirena", market_id="DO", external_id=external_id,
        name="Arroz La Garza 10 Lbs", brand="LA GARZA", size_text="10 Lbs",
        price=Money(47500, DOP), price_type=PriceType.ONLINE, source="vtex",
        url="https://x/p", ean="123",
    )


class _FakeStoreRepo:
    def __init__(self, known: set) -> None:
        self._known = known

    def exists(self, provider_id, external_id) -> bool:  # type: ignore[no-untyped-def]
        return (provider_id, external_id) in self._known

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        return "sp-1"


class _FakeSource:
    def __init__(self, entries) -> None:  # type: ignore[no-untyped-def]
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        yield from self._entries


class _FakeMatcher:
    def execute(self, incoming) -> None:  # type: ignore[no-untyped-def]
        pass


class _FakeClassifier:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def execute(self, product, market_id):  # type: ignore[no-untyped-def]
        self.calls.append(product.ref_id)


def test_classifies_new_product() -> None:
    classifier = _FakeClassifier()
    uc = RefreshCatalogPrices(
        _FakeStoreRepo(known=set()), matcher=_FakeMatcher(), classifier=classifier
    )
    uc.execute(_FakeSource([_entry("new-1")]))
    assert classifier.calls == ["sp-1"]


def test_classifies_known_product_on_refresh() -> None:
    classifier = _FakeClassifier()
    uc = RefreshCatalogPrices(
        _FakeStoreRepo(known={("p-sirena", "known-1")}), classifier=classifier
    )
    uc.execute(_FakeSource([_entry("known-1")]))
    assert classifier.calls == ["sp-1"]


def test_flag_off_no_classification() -> None:
    uc = RefreshCatalogPrices(_FakeStoreRepo(known={("p-sirena", "known-1")}))  # classifier=None
    result = uc.execute(_FakeSource([_entry("known-1")]))
    assert result.refreshed == 1  # comportamiento intacto

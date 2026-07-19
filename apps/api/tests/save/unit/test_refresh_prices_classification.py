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
from src.contexts.save.domain.entities.product_match import ProductMatch

DOP = Currency("DOP")


def _entry(external_id: str, category_path: tuple[str, ...] = ()) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-sirena", market_id="DO", external_id=external_id,
        name="Arroz La Garza 10 Lbs", brand="LA GARZA", size_text="10 Lbs",
        price=Money(47500, DOP), price_type=PriceType.ONLINE, source="vtex",
        url="https://x/p", ean="123", category_path=category_path,
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
    def execute(self, incoming):  # type: ignore[no-untyped-def]
        _ = incoming
        # Devuelve un ProductMatch REAL: el `MatchStoreProduct` de verdad SIEMPRE lo hace, y #4.3
        # lee su `status` para contar el desenlace. Un fake que devuelve None no honra el contrato
        # del port — pasa el test y rompe en producción.
        return ProductMatch(
            store_product_id=incoming.store_product_id,
            canonical_product_id="canon-1",
            confidence=1.0,
            method="ean",
            status="auto_linked",
        )


class _FakeClassifier:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.products: list = []

    def execute(self, product, market_id):  # type: ignore[no-untyped-def]
        self.calls.append(product.ref_id)
        self.products.append(product)


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


def test_passes_source_category_from_category_path() -> None:
    # Etapa B: la categoría de origen del adapter (category_path) llega al clasificador como
    # `source_category` (segunda señal), unida por " > ".
    classifier = _FakeClassifier()
    uc = RefreshCatalogPrices(
        _FakeStoreRepo(known={("p-sirena", "known-1")}), classifier=classifier
    )
    uc.execute(_FakeSource([_entry("known-1", category_path=("Despensa", "Arroz y Granos"))]))
    assert classifier.products[0].source_category == "Despensa > Arroz y Granos"


def test_flag_off_no_classification() -> None:
    uc = RefreshCatalogPrices(_FakeStoreRepo(known={("p-sirena", "known-1")}))  # classifier=None
    result = uc.execute(_FakeSource([_entry("known-1")]))
    assert result.refreshed == 1  # comportamiento intacto

"""Unit — use cases de Save (§6): SearchProducts + CompareProduct. Con repos FAKE (sin DB).

CompareProduct es el corazón del valor: dado un producto canónico, arma la tabla comparativa
(la misma de SupermercadosRD) delegando en el domain service. El precio NUNCA lo calcula el
use case: viene del repo y se compara con la money-math del dominio.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.application.products import ListProducts
from src.contexts.save.application.search import SearchProducts
from src.contexts.save.domain.comparison import StoreQuote
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


class FakeCanonicalRepo:
    def __init__(self, products: list[CanonicalProduct]) -> None:
        self._p = {p.id: p for p in products}

    def add(self, product: CanonicalProduct) -> None:  # pragma: no cover
        self._p[product.id] = product

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._p.get(product_id)

    def get_by_slug(self, slug: str, market_id: str) -> CanonicalProduct | None:
        return next(
            (p for p in self._p.values() if p.slug == slug and p.market_id == market_id), None
        )

    def search(self, query: str, market_id: str) -> list[CanonicalProduct]:
        return [
            p for p in self._p.values()
            if query.lower() in p.name.lower() and p.market_id == market_id
        ]

    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        products = sorted(
            (p for p in self._p.values() if p.market_id == market_id), key=lambda p: p.id
        )
        return products[offset : offset + limit]


class FakeStoreRepo:
    def __init__(self, quotes: dict[str, list[StoreQuote]]) -> None:
        self._q = quotes

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        return self._q.get(canonical_product_id, [])


def _canonical(cid: str, name: str, measure: UnitMeasure = UnitMeasure.MASS) -> CanonicalProduct:
    from src.contexts.save.domain.slug import product_slug
    return CanonicalProduct(
        cid, name, "La Garza", Quantity(Decimal("2"), measure), "t", "DO",
        slug=product_slug(name, "La Garza"),
    )


def test_compare_product_builds_sorted_table() -> None:
    canonical = _canonical("c1", "Arroz La Garza")
    quotes = {
        "c1": [
            StoreQuote("p-sirena", "Sirena", Money(47500, DOP)),
            StoreQuote("p-merca", "Merca", Money(42400, DOP)),
            StoreQuote("p-bravo", "Bravo", Money(43800, DOP)),
        ]
    }
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))
    dto = uc.execute("arroz-la-garza", "DO")

    assert dto.name == "Arroz La Garza"
    assert dto.slug == "arroz-la-garza"
    assert [e.provider_name for e in dto.entries] == ["Merca", "Bravo", "Sirena"]
    assert dto.entries[0].is_cheapest is True
    assert dto.entries[0].price_minor == 42400
    assert dto.entries[0].unit_price_minor == 21200  # 42400 / 2kg
    assert dto.entries[1].extra_minor == 1400        # +RD$14.00
    assert dto.cheapest_provider == "Merca"
    assert dto.spread_minor == 5100                  # 475 - 424


def test_compare_product_not_found_raises() -> None:
    uc = CompareProduct(FakeCanonicalRepo([]), FakeStoreRepo({}))
    with pytest.raises(CanonicalProductNotFoundError):
        uc.execute("nope", "DO")


def test_compare_product_falls_back_to_id_when_not_a_slug() -> None:
    # las páginas privadas (lista local, feed de alertas) linkean por UUID, no por slug legible.
    canonical = _canonical("c1", "Arroz La Garza")  # slug = "arroz-la-garza", id = "c1"
    quotes = {"c1": [StoreQuote("p-merca", "Merca", Money(42400, DOP))]}
    uc = CompareProduct(FakeCanonicalRepo([canonical]), FakeStoreRepo(quotes))
    dto = uc.execute("c1", "DO")  # "c1" no es el slug → fallback por id
    assert dto.canonical_product_id == "c1"
    assert dto.slug == "arroz-la-garza"


def test_search_products_filters_by_query_and_market() -> None:
    a = _canonical("c1", "Arroz La Garza")
    b = _canonical("c2", "Aceite Crisol", UnitMeasure.VOLUME)
    uc = SearchProducts(FakeCanonicalRepo([a, b]))
    res = uc.execute("arroz", "DO")
    assert [r.id for r in res] == ["c1"]
    assert res[0].name == "Arroz La Garza"


def test_list_products_returns_all_in_market_for_sitemap() -> None:
    a = _canonical("c1", "Arroz La Garza")
    b = _canonical("c2", "Aceite Crisol", UnitMeasure.VOLUME)
    uc = ListProducts(FakeCanonicalRepo([a, b]))
    res = uc.execute("DO")
    assert {r.id for r in res} == {"c1", "c2"}

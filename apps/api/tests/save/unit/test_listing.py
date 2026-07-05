"""Unit — ListCategoryProducts (§A4/A5): listado por categoría con facetas, filtros y orden.

Corazón de la Imagen #5. El use case agrega filas producto×tienda en memoria: precio mínimo
por producto, conteo de tiendas, precio/unidad (money-math del dominio), y las facetas
(precio, supermercados, marcas). Repos FAKE (sin DB).
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from datetime import datetime, timezone

from src.contexts.save.application.errors import CategoryNotFoundError
from src.contexts.save.application.listing import (
    ListBrandProducts,
    ListCategoryProducts,
    ListFeaturedProducts,
    ListProviderProducts,
    ListTodaysDeals,
    OfferingRow,
)
from src.contexts.save.domain.drops import PriceChange
from src.contexts.save.domain.entities import CanonicalProduct, PriceType
from src.contexts.save.domain.taxonomy import CategoryNode
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")
KG = UnitMeasure.MASS


def _q(amount: str) -> Quantity:
    return Quantity(Decimal(amount), KG)


class FakeTaxonomyRepo:
    def __init__(self, tree: list[CategoryNode], descendants: dict[str, list[str]]) -> None:
        self._tree = tree
        self._descendants = descendants

    def list_tree(self, market_id: str) -> list[CategoryNode]:
        return self._tree

    def descendant_ids(self, node_id: str) -> list[str]:
        return self._descendants.get(node_id, [node_id])


class FakeStoreRepo:
    def __init__(
        self,
        rows: dict[tuple[str, ...], list[OfferingRow]],
        market_rows: list[OfferingRow] | None = None,
        changes: list[PriceChange] | None = None,
    ) -> None:
        self._rows = rows
        self._market_rows = market_rows or []
        self._changes = changes or []

    def list_price_changes(self, market_id: str, since) -> list[PriceChange]:  # noqa: ANN001
        return self._changes

    def list_category_offerings(self, node_ids: list[str]) -> list[OfferingRow]:
        return self._rows.get(tuple(node_ids), [])

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        return self._market_rows


# Taxonomía: Arroz (n-arroz) con hijo Blanco (n-blanco). Productos cuelgan de n-blanco.
TREE = [
    CategoryNode(
        id="n-arroz",
        name="Arroz",
        slug="arroz",
        level=0,
        parent_id=None,
        children=(
            CategoryNode(
                id="n-blanco", name="Arroz Blanco", slug="arroz-blanco",
                level=1, parent_id="n-arroz", children=(),
            ),
        ),
    ),
]
DESCENDANTS = {"n-arroz": ["n-arroz", "n-blanco"]}

# 2 productos: Garza 10kg (3 tiendas, con presentación) y Bisono 5kg (2 tiendas, sin ella).
def _garza(pid: str, pname: str, minor: int) -> OfferingRow:
    return OfferingRow(
        "garza", "Arroz Garza", "La Garza", "Premium", "10 LB", "http://img/garza.jpg",
        _q("10"), pid, pname, Money(minor, DOP),
    )


def _bisono(pid: str, pname: str, minor: int) -> OfferingRow:
    return OfferingRow(
        "bisono", "Arroz Bisono", "Bisono", None, None, None,
        _q("5"), pid, pname, Money(minor, DOP),
    )


ROWS = {
    ("n-arroz", "n-blanco"): [
        _garza("p1", "Merca", 42400),
        _garza("p2", "Bravo", 43800),
        _garza("p3", "Sirena", 47500),
        _bisono("p1", "Merca", 21195),
        _bisono("p2", "Bravo", 22000),
    ],
}


def _uc() -> ListCategoryProducts:
    return ListCategoryProducts(FakeTaxonomyRepo(TREE, DESCENDANTS), FakeStoreRepo(ROWS))


def test_aggregates_min_price_and_store_count() -> None:
    res = _uc().execute("DO", "arroz")
    cards = {c.id: c for c in res.products}
    assert cards["garza"].price_minor == 42400  # el mínimo de las 3 tiendas
    assert cards["garza"].store_count == 3
    assert cards["bisono"].price_minor == 21195
    assert cards["bisono"].store_count == 2


def test_computes_unit_price_from_min_price() -> None:
    res = _uc().execute("DO", "arroz")
    garza = next(c for c in res.products if c.id == "garza")
    assert garza.unit_price_minor == 4240  # 42400 / 10kg
    assert garza.unit_measure == "mass"


def test_card_carries_presentation_fields() -> None:
    res = _uc().execute("DO", "arroz")
    garza = next(c for c in res.products if c.id == "garza")
    assert garza.display_size == "10 LB"
    assert garza.quality == "Premium"
    assert garza.image_url == "http://img/garza.jpg"


def test_breadcrumb_and_subcategories() -> None:
    res = _uc().execute("DO", "arroz")
    assert res.name == "Arroz"
    assert [b.slug for b in res.breadcrumb] == ["arroz"]
    assert [s.slug for s in res.subcategories] == ["arroz-blanco"]
    assert res.total == 2


def test_facets_price_stores_brands() -> None:
    res = _uc().execute("DO", "arroz")
    assert res.facets.price.min_minor == 21195
    assert res.facets.price.max_minor == 42400
    stores = {f.id: f.count for f in res.facets.stores}
    assert stores == {"p1": 2, "p2": 2, "p3": 1}  # Merca y Bravo tienen ambos; Sirena solo Garza
    brands = {f.name: f.count for f in res.facets.brands}
    assert brands == {"La Garza": 1, "Bisono": 1}


def test_facets_price_histogram_and_buckets() -> None:
    res = _uc().execute("DO", "arroz")
    price = res.facets.price
    # histograma: cada producto cae en un bin → la suma = nº de productos
    assert sum(price.histogram) == 2
    # buckets: 3 rangos preset, conteos suman el total, el último es "y más" (sin tope)
    assert sum(b.count for b in price.buckets) == 2
    assert price.buckets[-1].max_minor is None
    # monotonía de los umbrales
    mins = [b.min_minor for b in price.buckets]
    assert mins == sorted(mins)


def test_cards_carry_discount_bps_from_recent_drop() -> None:
    changes = [
        PriceChange(
            canonical_product_id="garza",
            product_name="Arroz Garza",
            provider_id="p1",
            provider_name="Merca",
            previous=Money(47500, DOP),
            current=Money(45000, DOP),
            captured_at=datetime(2026, 7, 4, tzinfo=timezone.utc),
            price_type=PriceType.ONLINE,
        )
    ]
    uc = ListCategoryProducts(
        FakeTaxonomyRepo(TREE, DESCENDANTS), FakeStoreRepo(ROWS, changes=changes)
    )
    res = uc.execute("DO", "arroz")
    garza = next(c for c in res.products if c.id == "garza")
    bisono = next(c for c in res.products if c.id == "bisono")
    assert garza.discount_bps == 526  # (47500-45000)/47500 en bps
    assert bisono.discount_bps is None  # sin bajada → sin badge


def test_filter_by_store_keeps_products_carried_by_it() -> None:
    res = _uc().execute("DO", "arroz", stores=("p3",))  # solo Sirena → solo Garza
    assert [c.id for c in res.products] == ["garza"]


def test_filter_by_brand() -> None:
    res = _uc().execute("DO", "arroz", brands=("Bisono",))
    assert [c.id for c in res.products] == ["bisono"]


def test_filter_by_price_range_on_min_price() -> None:
    res = _uc().execute("DO", "arroz", price_max=30000)  # solo Bisono (21195)
    assert [c.id for c in res.products] == ["bisono"]


def test_sort_by_price_then_by_unit_price() -> None:
    by_price = _uc().execute("DO", "arroz", sort="price")
    assert [c.id for c in by_price.products] == ["bisono", "garza"]  # 21195 < 42400
    by_unit = _uc().execute("DO", "arroz", sort="unit_price")
    # unit: garza 4240/kg, bisono 4239/kg → bisono primero
    assert [c.id for c in by_unit.products] == ["bisono", "garza"]


def test_pagination_reports_total_before_paging() -> None:
    res = _uc().execute("DO", "arroz", limit=1, offset=0)
    assert res.total == 2
    assert len(res.products) == 1


def test_unknown_slug_raises() -> None:
    with pytest.raises(CategoryNotFoundError):
        _uc().execute("DO", "no-existe")


def test_popular_ignores_filters_and_sorts_by_store_count() -> None:
    # Con price_max=30000 (solo bisono pasaría el filtro), popular sigue trayendo AMBOS,
    # ordenados por store_count desc: garza (3 tiendas) antes que bisono (2).
    res = _uc().execute("DO", "arroz", price_max=30000)
    assert [c.id for c in res.popular] == ["garza", "bisono"]


# ── ListFeaturedProducts (rails de la home) ──

MARKET_ROWS = [
    _garza("p1", "Merca", 42400),
    _garza("p2", "Bravo", 43800),
    _garza("p3", "Sirena", 47500),  # Garza: 3 tiendas, unit 4240/kg
    _bisono("p1", "Merca", 21195),
    _bisono("p2", "Bravo", 22000),  # Bisono: 2 tiendas, unit 4239/kg
]


def _featured() -> ListFeaturedProducts:
    return ListFeaturedProducts(FakeStoreRepo({}, MARKET_ROWS))


def test_featured_best_value_sorts_by_unit_price() -> None:
    cards = _featured().execute("DO", sort="unit_price")
    assert [c.id for c in cards] == ["bisono", "garza"]  # 4239 < 4240


def test_featured_popular_sorts_by_store_count_desc() -> None:
    cards = _featured().execute("DO", sort="popular")
    assert [c.id for c in cards] == ["garza", "bisono"]  # 3 tiendas > 2


def test_featured_respects_limit() -> None:
    cards = _featured().execute("DO", sort="price", limit=1)
    assert len(cards) == 1
    assert cards[0].id == "bisono"  # más barato


# ── ListBrandProducts ("Más de la marca") ──


class FakeCanonicalRepo:
    def __init__(self, products: list[CanonicalProduct]) -> None:
        self._p = {p.id: p for p in products}

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._p.get(product_id)


def test_brand_products_returns_same_brand_excluding_self() -> None:
    garza = CanonicalProduct("garza", "Arroz Garza", "La Garza", _q("10"), "t", "DO")
    rows = [
        _garza("p1", "Merca", 42400),
        OfferingRow("garza2", "Arroz Garza 5", "La Garza", None, None, None, _q("5"), "p1", "Merca", Money(21000, DOP)),
        _bisono("p1", "Merca", 21195),  # otra marca → no
    ]
    uc = ListBrandProducts(FakeCanonicalRepo([garza]), FakeStoreRepo({}, rows))
    cards = uc.execute("garza")
    assert [c.id for c in cards] == ["garza2"]  # misma marca, sin el propio garza


# ── ListTodaysDeals (A7: "Mejores ofertas de hoy") ──

NOW = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)


def _drop_change(pid: str, prev_minor: int, curr_minor: int) -> PriceChange:
    return PriceChange(
        canonical_product_id=pid,
        product_name=pid,
        provider_id="p-x",
        provider_name="X",
        previous=Money(prev_minor, DOP),
        current=Money(curr_minor, DOP),
        captured_at=NOW,
        price_type=PriceType.ONLINE,
    )


class FakeDealsRepo:
    def __init__(self, changes: list[PriceChange], market_rows: list[OfferingRow]) -> None:
        self._changes = changes
        self._market_rows = market_rows

    def list_price_changes(self, market_id: str, since) -> list[PriceChange]:  # noqa: ANN001
        return self._changes

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        return self._market_rows


def test_deals_orders_by_biggest_relative_drop_first() -> None:
    changes = [_drop_change("garza", 47500, 45000), _drop_change("bisono", 40000, 30000)]
    uc = ListTodaysDeals(FakeDealsRepo(changes, MARKET_ROWS))
    cards = uc.execute("DO", now=NOW)
    assert [c.id for c in cards] == ["bisono", "garza"]  # 2500 bps > 526 bps


def test_deals_dedupes_same_product_keeping_biggest_drop() -> None:
    changes = [
        _drop_change("garza", 47500, 45000),  # 526 bps, Sirena
        _drop_change("garza", 40000, 30000),  # 2500 bps, otra tienda con más descuento
    ]
    uc = ListTodaysDeals(FakeDealsRepo(changes, MARKET_ROWS))
    cards = uc.execute("DO", now=NOW)
    assert [c.id for c in cards] == ["garza"]  # una sola card, no duplicada


def test_deals_skips_products_no_longer_in_market_offerings() -> None:
    changes = [_drop_change("descontinuado", 10000, 9000), _drop_change("garza", 47500, 45000)]
    uc = ListTodaysDeals(FakeDealsRepo(changes, MARKET_ROWS))
    cards = uc.execute("DO", now=NOW)
    assert [c.id for c in cards] == ["garza"]  # "descontinuado" no está en la oferta vigente


def test_deals_respects_limit() -> None:
    changes = [_drop_change("garza", 47500, 45000), _drop_change("bisono", 40000, 30000)]
    uc = ListTodaysDeals(FakeDealsRepo(changes, MARKET_ROWS))
    cards = uc.execute("DO", now=NOW, limit=1)
    assert len(cards) == 1
    assert cards[0].id == "bisono"  # mayor descuento relativo


def test_deals_empty_when_no_drops() -> None:
    uc = ListTodaysDeals(FakeDealsRepo([], MARKET_ROWS))
    assert uc.execute("DO", now=NOW) == []


# ── ListProviderProducts (A9: catálogo de un supermercado) ──


def test_provider_products_shows_only_that_stores_price_and_store_count_one() -> None:
    # Garza: p1=42400, p2=43800, p3=47500 → visto desde p1 (Merca), su propio precio, 1 tienda.
    uc = ListProviderProducts(FakeStoreRepo({}, MARKET_ROWS))
    cards = uc.execute("DO", "p1")
    garza = next(c for c in cards if c.id == "garza")
    assert garza.price_minor == 42400
    assert garza.store_count == 1


def test_provider_products_excludes_products_not_carried_by_that_store() -> None:
    uc = ListProviderProducts(FakeStoreRepo({}, MARKET_ROWS))
    cards = uc.execute("DO", "p3")  # Sirena solo tiene Garza en MARKET_ROWS
    assert [c.id for c in cards] == ["garza"]


def test_provider_products_empty_for_unknown_provider() -> None:
    uc = ListProviderProducts(FakeStoreRepo({}, MARKET_ROWS))
    assert uc.execute("DO", "no-existe") == []

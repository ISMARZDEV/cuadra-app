"""Unit — ListCategoryProducts (§A4/A5): listado por categoría con facetas, filtros y orden.

Corazón de la Imagen #5. El use case agrega filas producto×tienda en memoria: precio mínimo
por producto, conteo de tiendas, precio/unidad (money-math del dominio), y las facetas
(precio, supermercados, marcas). Repos FAKE (sin DB).
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.application.errors import CategoryNotFoundError
from src.contexts.save.application.listing import (
    ListCategoryProducts,
    ListFeaturedProducts,
    OfferingRow,
)
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
    ) -> None:
        self._rows = rows
        self._market_rows = market_rows or []

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

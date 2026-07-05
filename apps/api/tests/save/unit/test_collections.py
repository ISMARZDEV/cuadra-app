"""Unit — ListCollections / GetCollection (A6: carruseles curados). Repos FAKE, sin DB.

La curaduría es hand-pick: el repo devuelve los canonical_product_id en ORDEN (position); el use
case reusa la agregación producto×tienda de `listing` (_aggregate/_to_card) para armar las cards
con precio mínimo. Productos sin oferta vigente se descartan; colecciones que quedan vacías no se
listan (no mostramos rails vacíos).
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.application.collections import GetCollection, ListCollections
from src.contexts.save.domain.entities import Collection
from src.contexts.save.domain.listing import OfferingRow
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _row(pid: str, name: str, price_minor: int) -> OfferingRow:
    return OfferingRow(
        pid, name, "ACME", None, None, None,
        Quantity(Decimal("1"), UnitMeasure.COUNT), "p1", "Sirena", Money(price_minor, DOP),
    )


class FakeCollectionRepo:
    def __init__(
        self, collections: list[Collection], members: dict[str, list[str]]
    ) -> None:
        self._collections = collections
        self._members = members  # collection_id → [canonical_product_id] ORDENADO

    def list_by_market(self, market_id: str) -> list[Collection]:
        return [c for c in self._collections if c.market_id == market_id]

    def get_by_slug(self, slug: str, market_id: str) -> Collection | None:
        return next(
            (c for c in self._collections if c.slug == slug and c.market_id == market_id), None
        )

    def list_product_ids(self, collection_id: str) -> list[str]:
        return self._members.get(collection_id, [])


class FakeStoreRepo:
    def __init__(self, market_rows: list[OfferingRow]) -> None:
        self._market_rows = market_rows

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        return self._market_rows

    def list_price_changes(self, market_id: str, since):  # noqa: ANN001, ANN201
        return []


def test_lists_collections_with_products_in_position_order() -> None:
    collections = [Collection("c1", "premium", "Selección premium", "DO")]
    members = {"c1": ["b", "a"]}  # position: b antes que a
    rows = [_row("a", "Arroz A", 100), _row("b", "Arroz B", 200)]
    result = ListCollections(FakeCollectionRepo(collections, members), FakeStoreRepo(rows)).execute("DO")
    assert len(result) == 1
    assert result[0].slug == "premium"
    assert result[0].name == "Selección premium"
    assert [p.id for p in result[0].products] == ["b", "a"]


def test_skips_absent_products_and_empty_collections() -> None:
    collections = [
        Collection("c1", "premium", "Premium", "DO"),
        Collection("c2", "vacia", "Vacía", "DO"),
    ]
    members = {"c1": ["a", "ghost"], "c2": ["ghost"]}
    rows = [_row("a", "Arroz A", 100)]
    result = ListCollections(FakeCollectionRepo(collections, members), FakeStoreRepo(rows)).execute("DO")
    assert len(result) == 1  # c2 queda vacía → no se lista
    assert [p.id for p in result[0].products] == ["a"]  # ghost sin oferta → descartado


def test_per_rail_limits_products() -> None:
    collections = [Collection("c1", "premium", "Premium", "DO")]
    members = {"c1": ["a", "b", "c"]}
    rows = [_row("a", "A", 1), _row("b", "B", 2), _row("c", "C", 3)]
    result = ListCollections(
        FakeCollectionRepo(collections, members), FakeStoreRepo(rows)
    ).execute("DO", per_rail=2)
    assert [p.id for p in result[0].products] == ["a", "b"]


def test_other_market_collections_excluded() -> None:
    collections = [Collection("c1", "premium", "Premium", "US")]
    members = {"c1": ["a"]}
    rows = [_row("a", "A", 1)]
    result = ListCollections(FakeCollectionRepo(collections, members), FakeStoreRepo(rows)).execute("DO")
    assert result == []


def test_get_collection_returns_all_products_by_slug() -> None:
    collections = [Collection("c1", "premium", "Premium", "DO")]
    members = {"c1": ["a", "b"]}
    rows = [_row("a", "A", 1), _row("b", "B", 2)]
    dto = GetCollection(FakeCollectionRepo(collections, members), FakeStoreRepo(rows)).execute("premium", "DO")
    assert dto is not None
    assert dto.slug == "premium"
    assert [p.id for p in dto.products] == ["a", "b"]


def test_get_collection_unknown_slug_returns_none() -> None:
    dto = GetCollection(FakeCollectionRepo([], {}), FakeStoreRepo([])).execute("nope", "DO")
    assert dto is None

"""Unit — cursor de posición en el catálogo canónico (pager prev/next).

El use-case es puro orquestación: recibe filtros/orden, pide el cursor al repo y lo devuelve.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from src.contexts.save.domain.canonical_catalog import (
    CanonicalCatalogCursor,
    CanonicalCatalogFilters,
    CanonicalCatalogRow,
)
from src.contexts.save.application.canonical_catalog import GetCanonicalProductCursor


@dataclass
class FakeRepo:
    cursor: CanonicalCatalogCursor

    def get_catalog_cursor(self, *, market_id, canonical_product_id, filters, sort):  # type: ignore[no-untyped-def]
        self.last_call = {"market_id": market_id, "canonical_product_id": canonical_product_id, "filters": filters, "sort": sort}
        return self.cursor


def _row(canonical_product_id: str, name: str) -> CanonicalCatalogRow:
    return CanonicalCatalogRow(
        canonical_product_id=canonical_product_id,
        slug=name.lower().replace(" ", "-"),
        name=name,
        brand="",
        size_amount=Decimal("1"),
        size_measure="count",
    )


def test_cursor_delegates_to_repo_with_same_arguments() -> None:
    cursor = CanonicalCatalogCursor(total=10, position=3, previous_id="prev-id", next_id="next-id")
    repo = FakeRepo(cursor)
    use_case = GetCanonicalProductCursor(repo)
    filters = CanonicalCatalogFilters(search="arroz")

    result = use_case.execute(
        market_id="DO",
        canonical_product_id="cp-id",
        filters=filters,
        sort="-name",
    )

    assert result == cursor
    assert repo.last_call == {
        "market_id": "DO",
        "canonical_product_id": "cp-id",
        "filters": filters,
        "sort": "-name",
    }


def test_cursor_when_product_not_in_filtered_results() -> None:
    cursor = CanonicalCatalogCursor(total=0, position=None, previous_id=None, next_id=None)
    repo = FakeRepo(cursor)
    use_case = GetCanonicalProductCursor(repo)

    result = use_case.execute(market_id="DO", canonical_product_id="cp-id", filters=None, sort="name")

    assert result.total == 0
    assert result.position is None
    assert result.previous_id is None
    assert result.next_id is None

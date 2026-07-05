"""Integration — SqlCollectionRepository (A6). Requiere DB (`make db-up`).

Prueba lo clave: `list_product_ids` respeta el ORDEN por `position` (la curaduría hand-pick),
`get_by_slug` aísla por mercado, y un uuid malformado no revienta (contrato con el resto de repos).
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    CollectionModel,
    CollectionProductModel,
)
from src.contexts.save.infrastructure.repositories import SqlCollectionRepository


def test_collection_round_trip_and_position_order(db_session) -> None:  # type: ignore[no-untyped-def]
    p1 = CanonicalProductModel(
        name="Protector A", size_amount=Decimal("1"), size_measure="count", market_id="DO"
    )
    p2 = CanonicalProductModel(
        name="Protector B", size_amount=Decimal("1"), size_measure="count", market_id="DO"
    )
    db_session.add_all([p1, p2])
    db_session.flush()

    col = CollectionModel(slug="test-protector-xyz", name="Test Protector", market_id="DO")
    db_session.add(col)
    db_session.flush()
    # p2 primero (position 0), p1 después (position 1) → el orden NO es el de inserción del canónico
    db_session.add_all(
        [
            CollectionProductModel(collection_id=col.id, canonical_product_id=p2.id, position=0),
            CollectionProductModel(collection_id=col.id, canonical_product_id=p1.id, position=1),
        ]
    )
    db_session.flush()

    repo = SqlCollectionRepository(db_session)

    assert "test-protector-xyz" in [c.slug for c in repo.list_by_market("DO")]

    got = repo.get_by_slug("test-protector-xyz", "DO")
    assert got is not None
    assert got.name == "Test Protector"
    assert repo.get_by_slug("test-protector-xyz", "US") is None  # otro mercado no la ve

    assert repo.list_product_ids(got.id) == [str(p2.id), str(p1.id)]  # respeta position


def test_list_product_ids_invalid_uuid_returns_empty(db_session) -> None:  # type: ignore[no-untyped-def]
    assert SqlCollectionRepository(db_session).list_product_ids("no-es-un-uuid") == []

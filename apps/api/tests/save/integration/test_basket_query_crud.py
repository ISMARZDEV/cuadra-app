"""Integration — CRUD de BasketQuery (canasta curada) (F2·B1/B3, Batch 3D, tareas 3.13-3.15).

`basket_query` reemplaza `BASKET_QUERIES` hardcodeado en `ingestion/save/sources.py` — la canasta
la mantiene ahora un admin desde la consola (`ADMIN_SAVE_INGESTION_OPS`). `RemoveBasketQuery` borra
la fila (poda dura, la query sale de la canasta); `UpdateBasketQuery` puede alternar `active`
(soft-disable, sin perder el registro) — ambos son legítimos (features.md #14).
"""
from __future__ import annotations

import uuid

import pytest

from src.contexts.save.application.basket_query import (
    CreateBasketQuery,
    ListBasketQueries,
    RemoveBasketQuery,
    UpdateBasketQuery,
)
from src.contexts.save.domain.entities import BasketQuery
from src.contexts.save.infrastructure.repositories import SqlBasketQueryRepository


def test_create_basket_query_persists(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)

    query = CreateBasketQuery(repo).execute(
        market_id="DO", query_text="arroz la garza test", category_label="Granos y legumbres",
    )

    persisted = repo.get_by_id(query.id)
    assert persisted is not None
    assert persisted.market_id == "DO"
    assert persisted.query_text == "arroz la garza test"
    assert persisted.category_label == "Granos y legumbres"
    assert persisted.position == 0
    assert persisted.active is True


def test_create_basket_query_rejects_duplicate_market_and_text(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    CreateBasketQuery(repo).execute(market_id="DO", query_text="arroz duplicado test")

    with pytest.raises(ValueError, match="Ya existe"):
        CreateBasketQuery(repo).execute(market_id="DO", query_text="arroz duplicado test")


def test_list_by_market_returns_only_that_market(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    CreateBasketQuery(repo).execute(market_id="DO", query_text="query do test")
    CreateBasketQuery(repo).execute(market_id="US", query_text="query us test")

    rows = ListBasketQueries(repo).execute("DO")

    assert any(r.query_text == "query do test" for r in rows)
    assert all(r.market_id == "DO" for r in rows)


def test_update_basket_query_changes_mutable_fields(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    query = CreateBasketQuery(repo).execute(market_id="DO", query_text="arroz update test")

    updated = UpdateBasketQuery(repo).execute(query.id, query_text="arroz actualizado test")

    assert updated.query_text == "arroz actualizado test"
    persisted = repo.get_by_id(query.id)
    assert persisted is not None
    assert persisted.query_text == "arroz actualizado test"
    assert persisted.category_label is None  # no tocado -> se mantiene


def test_update_basket_query_can_toggle_active(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    query = CreateBasketQuery(repo).execute(market_id="DO", query_text="arroz toggle test")

    updated = UpdateBasketQuery(repo).execute(query.id, active=False)

    assert updated.active is False
    persisted = repo.get_by_id(query.id)
    assert persisted is not None
    assert persisted.active is False


def test_update_basket_query_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    with pytest.raises(ValueError, match="no encontrada"):
        UpdateBasketQuery(repo).execute(str(uuid.uuid4()), query_text="x")


def test_remove_basket_query_deletes_the_row(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    query = CreateBasketQuery(repo).execute(market_id="DO", query_text="arroz remove test")

    RemoveBasketQuery(repo).execute(query.id)

    assert repo.get_by_id(query.id) is None


def test_remove_basket_query_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)
    with pytest.raises(ValueError, match="no encontrada"):
        RemoveBasketQuery(repo).execute(str(uuid.uuid4()))


def test_list_active_returns_only_active_ordered_by_position(db_session) -> None:  # type: ignore[no-untyped-def]
    # F1 (conectar la canasta a la ingesta): la ingesta lee SOLO las queries `active=true`, en orden
    # de `position`. Las desactivadas (soft-disable) quedan en la tabla pero no se ingieren.
    repo = SqlBasketQueryRepository(db_session)
    market = f"T{uuid.uuid4().hex[:6]}"  # market único: la tabla ya tiene 213 filas "DO" (backfill)
    repo.add(BasketQuery(id=str(uuid.uuid4()), market_id=market, query_text="segunda", position=2))
    repo.add(BasketQuery(id=str(uuid.uuid4()), market_id=market, query_text="primera", position=1))
    repo.add(
        BasketQuery(id=str(uuid.uuid4()), market_id=market, query_text="inactiva", position=3, active=False)
    )

    active = repo.list_active(market)

    assert [q.query_text for q in active] == ["primera", "segunda"]
    assert all(q.active for q in active)

"""Integration — RBAC de las rutas `/admin/save/basket-queries/*` (F2·B1/B3, Batch 3D,
tareas 3.13-3.15) + verificación del backfill de la canasta curada (3.15).

Mismo gate que Provider/Source (`ADMIN_SAVE_INGESTION_OPS`), mismo router (`ingestion_router`) —
un rol con SOLO `ADMIN_SAVE_MATCHING_REVIEW` NO debe poder tocar estas rutas. Duplicado
(market_id, query_text) -> 409 (conflicto de unicidad explícito, nunca un 500 crudo de
IntegrityError).
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.repositories import SqlBasketQueryRepository
from src.main import app


def _seed_role_user(db_session, role_key: str) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"{role_key}@cuadra.do", name=role_key, home_market_id="DO", current_market_id="DO"
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key=role_key))
    db_session.flush()
    return str(user.id)


def _client(db_session, user_id: str) -> TestClient:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    return TestClient(app)


def _clear() -> None:
    app.dependency_overrides.clear()


def test_non_admin_gets_403_on_every_basket_query_route(db_session) -> None:  # type: ignore[no-untyped-def]
    user_id = _seed_role_user(db_session, "normal_user")
    client = _client(db_session, user_id)
    try:
        fake_id = str(uuid.uuid4())
        assert client.get("/v1/admin/save/basket-queries").status_code == 403
        assert (
            client.post(
                "/v1/admin/save/basket-queries",
                json={"market_id": "DO", "query_text": "arroz"},
            ).status_code
            == 403
        )
        assert (
            client.patch(
                f"/v1/admin/save/basket-queries/{fake_id}", json={"query_text": "y"}
            ).status_code
            == 403
        )
        assert client.delete(f"/v1/admin/save/basket-queries/{fake_id}").status_code == 403
    finally:
        _clear()


def test_super_admin_can_create_list_update_and_delete(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r_create = client.post(
            "/v1/admin/save/basket-queries",
            json={
                "market_id": "DO",
                "query_text": "arroz api test",
                "category_label": "Granos y legumbres",
            },
        )
        assert r_create.status_code == 201, r_create.text
        query_id = r_create.json()["id"]
        assert r_create.json()["active"] is True

        r_list = client.get("/v1/admin/save/basket-queries", params={"market": "DO"})
        assert r_list.status_code == 200, r_list.text
        assert any(row["id"] == query_id for row in r_list.json())

        r_update = client.patch(
            f"/v1/admin/save/basket-queries/{query_id}", json={"active": False}
        )
        assert r_update.status_code == 200, r_update.text
        assert r_update.json()["active"] is False

        r_delete = client.delete(f"/v1/admin/save/basket-queries/{query_id}")
        assert r_delete.status_code == 204, r_delete.text

        r_list_after = client.get("/v1/admin/save/basket-queries", params={"market": "DO"})
        assert all(row["id"] != query_id for row in r_list_after.json())
    finally:
        _clear()


def test_create_basket_query_duplicate_returns_409(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        client.post(
            "/v1/admin/save/basket-queries",
            json={"market_id": "DO", "query_text": "arroz duplicado api test"},
        )
        r = client.post(
            "/v1/admin/save/basket-queries",
            json={"market_id": "DO", "query_text": "arroz duplicado api test"},
        )
        assert r.status_code == 409
    finally:
        _clear()


def test_update_unknown_basket_query_returns_404(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r = client.patch(
            f"/v1/admin/save/basket-queries/{uuid.uuid4()}", json={"query_text": "x"}
        )
        assert r.status_code == 404
    finally:
        _clear()


def test_delete_unknown_basket_query_returns_404(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r = client.delete(f"/v1/admin/save/basket-queries/{uuid.uuid4()}")
        assert r.status_code == 404
    finally:
        _clear()


def test_backfill_populated_do_basket_queries(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlBasketQueryRepository(db_session)

    rows = repo.list_by_market("DO")

    assert len(rows) == 213
    assert any(
        r.query_text == "arroz la garza" and r.category_label == "Granos y legumbres"
        for r in rows
    )
    assert any(
        r.query_text == "corn flakes kelloggs" and r.category_label == "Cereales y avena"
        for r in rows
    )

"""Integration — RBAC de las rutas `/admin/save/providers/*` (F2·B1/B3, Batch 3A, tarea 3.3).

Estas rutas exigen `ADMIN_SAVE_INGESTION_OPS` server-side (distinta de `ADMIN_SAVE_MATCHING_REVIEW`,
que gatea `/admin/save/review-queue/*`) — un rol con SOLO la capability de revisión de matching
NO debe poder tocar el CRUD de ingesta, y viceversa. `super_admin` (seed_identity) tiene ambas.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
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


def test_non_admin_gets_403_on_every_provider_route(db_session) -> None:  # type: ignore[no-untyped-def]
    user_id = _seed_role_user(db_session, "normal_user")
    client = _client(db_session, user_id)
    try:
        assert client.get("/v1/admin/save/providers").status_code == 403
        assert (
            client.post(
                "/v1/admin/save/providers",
                json={
                    "name": "Test", "type": "supermarket", "platform": "vtex", "market_id": "DO",
                },
            ).status_code
            == 403
        )
        fake_id = str(uuid.uuid4())
        assert (
            client.patch(f"/v1/admin/save/providers/{fake_id}", json={"name": "X"}).status_code
            == 403
        )
        assert (
            client.patch(
                f"/v1/admin/save/providers/{fake_id}/logo", json={"logo_url": "https://x.test/l.png"}
            ).status_code
            == 403
        )
    finally:
        _clear()


def test_super_admin_can_create_update_and_set_logo(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r_create = client.post(
            "/v1/admin/save/providers",
            json={
                "name": "Jumbo", "type": "supermarket", "platform": "vtex", "market_id": "DO",
                "logo_url": "https://cdn.example.com/jumbo.png",
            },
        )
        assert r_create.status_code == 201, r_create.text
        provider_id = r_create.json()["id"]
        assert r_create.json()["logo_url"] == "https://cdn.example.com/jumbo.png"

        r_update = client.patch(
            f"/v1/admin/save/providers/{provider_id}", json={"name": "Jumbo RD"}
        )
        assert r_update.status_code == 200, r_update.text
        assert r_update.json()["name"] == "Jumbo RD"
        assert r_update.json()["logo_url"] == "https://cdn.example.com/jumbo.png"  # sin tocar

        r_logo = client.patch(
            f"/v1/admin/save/providers/{provider_id}/logo",
            json={"logo_url": "https://cdn.example.com/jumbo-2.png"},
        )
        assert r_logo.status_code == 200, r_logo.text
        assert r_logo.json()["logo_url"] == "https://cdn.example.com/jumbo-2.png"
        assert r_logo.json()["name"] == "Jumbo RD"  # sin tocar
    finally:
        _clear()


def test_admin_list_returns_full_dto(db_session) -> None:  # type: ignore[no-untyped-def]
    """El GET admin trae type/platform/market (lo que el endpoint público `listProviders` NO da)."""
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        client.post(
            "/v1/admin/save/providers",
            json={"name": "Bravo", "type": "supermarket", "platform": "rest_catalog",
                  "market_id": "DO"},
        )
        r = client.get("/v1/admin/save/providers?market=DO")
        assert r.status_code == 200, r.text
        rows = r.json()
        bravo = next(p for p in rows if p["name"] == "Bravo")
        assert bravo["type"] == "supermarket"
        assert bravo["platform"] == "rest_catalog"
        assert bravo["market_id"] == "DO"
    finally:
        _clear()


def test_update_unknown_provider_returns_404(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r = client.patch(
            f"/v1/admin/save/providers/{uuid.uuid4()}", json={"name": "Nadie"}
        )
        assert r.status_code == 404
    finally:
        _clear()

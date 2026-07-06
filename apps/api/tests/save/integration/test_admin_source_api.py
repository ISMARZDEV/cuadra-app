"""Integration — RBAC de las rutas `/admin/save/sources/*` (F2·B1/B3, Batch 3B, tareas 3.6-3.7).

Mismo gate que Provider (`ADMIN_SAVE_INGESTION_OPS`), mismo router (`ingestion_router`) —
un rol con SOLO `ADMIN_SAVE_MATCHING_REVIEW` NO debe poder tocar estas rutas.
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


def _create_provider(client: TestClient) -> str:
    r = client.post(
        "/v1/admin/save/providers",
        json={"name": "Jumbo", "type": "supermarket", "platform": "magento", "market_id": "DO"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_non_admin_gets_403_on_every_source_route(db_session) -> None:  # type: ignore[no-untyped-def]
    user_id = _seed_role_user(db_session, "normal_user")
    client = _client(db_session, user_id)
    try:
        fake_id = str(uuid.uuid4())
        assert (
            client.post(
                "/v1/admin/save/sources",
                json={"provider_id": fake_id, "platform": "magento", "base_url": "https://x.do"},
            ).status_code
            == 403
        )
        assert (
            client.patch(
                f"/v1/admin/save/sources/{fake_id}", json={"base_url": "https://y.do"}
            ).status_code
            == 403
        )
        assert client.post(f"/v1/admin/save/sources/{fake_id}/pause").status_code == 403
        assert client.post(f"/v1/admin/save/sources/{fake_id}/resume").status_code == 403
    finally:
        _clear()


def test_super_admin_can_create_update_pause_and_resume(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        provider_id = _create_provider(client)

        r_create = client.post(
            "/v1/admin/save/sources",
            json={
                "provider_id": provider_id,
                "platform": "magento",
                "base_url": "https://jumbo.com.do",
                "headers": {"Store": "jumbo"},
            },
        )
        assert r_create.status_code == 201, r_create.text
        source_id = r_create.json()["id"]
        assert r_create.json()["headers"] == {"Store": "jumbo"}
        assert r_create.json()["enabled"] is True

        r_update = client.patch(
            f"/v1/admin/save/sources/{source_id}", json={"base_url": "https://jumbo2.com.do"}
        )
        assert r_update.status_code == 200, r_update.text
        assert r_update.json()["base_url"] == "https://jumbo2.com.do"

        r_pause = client.post(f"/v1/admin/save/sources/{source_id}/pause")
        assert r_pause.status_code == 200, r_pause.text
        assert r_pause.json()["enabled"] is False
        assert r_pause.json()["paused_at"] is not None

        r_resume = client.post(f"/v1/admin/save/sources/{source_id}/resume")
        assert r_resume.status_code == 200, r_resume.text
        assert r_resume.json()["enabled"] is True
        assert r_resume.json()["paused_at"] is None
    finally:
        _clear()


def test_create_source_for_provider_with_existing_source_returns_422(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        provider_id = _create_provider(client)
        client.post(
            "/v1/admin/save/sources",
            json={
                "provider_id": provider_id, "platform": "magento", "base_url": "https://jumbo.com.do",
            },
        )
        r = client.post(
            "/v1/admin/save/sources",
            json={"provider_id": provider_id, "platform": "vtex", "base_url": "https://otro.do"},
        )
        assert r.status_code == 422
    finally:
        _clear()


def test_update_unknown_source_returns_404(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r = client.patch(
            f"/v1/admin/save/sources/{uuid.uuid4()}", json={"base_url": "https://x.do"}
        )
        assert r.status_code == 404
    finally:
        _clear()

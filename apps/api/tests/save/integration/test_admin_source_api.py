"""Integration — RBAC de las rutas `/admin/save/sources/*` (F2·B1/B3, Batch 3B, tareas 3.6-3.7;
`/sources/{id}/test`, Batch 3C, tareas 3.8-3.10).

Mismo gate que Provider (`ADMIN_SAVE_INGESTION_OPS`), mismo router (`ingestion_router`) —
un rol con SOLO `ADMIN_SAVE_MATCHING_REVIEW` NO debe poder tocar estas rutas. Las pruebas del
guard SSRF en sí viven en `tests/save/unit/test_ssrf_guard.py`; acá se prueba el boundary HTTP
(RBAC + status codes + zero-persistence de extremo a extremo) mockeando DNS y HTTP.
"""
from __future__ import annotations

import socket
import uuid
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.catalog_sources import ssrf_guard
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


def _create_source(client: TestClient, provider_id: str, base_url: str) -> str:
    r = client.post(
        "/v1/admin/save/sources",
        json={"provider_id": provider_id, "platform": "vtex", "base_url": base_url},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_non_admin_gets_403_on_test_route(db_session) -> None:  # type: ignore[no-untyped-def]
    user_id = _seed_role_user(db_session, "normal_user")
    client = _client(db_session, user_id)
    try:
        fake_id = str(uuid.uuid4())
        r = client.post(f"/v1/admin/save/sources/{fake_id}/test", json={"query": "arroz"})
        assert r.status_code == 403
    finally:
        _clear()


def test_test_unknown_source_returns_404(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        r = client.post(
            f"/v1/admin/save/sources/{uuid.uuid4()}/test", json={"query": "arroz"}
        )
        assert r.status_code == 404
    finally:
        _clear()


def test_super_admin_can_test_source_and_gets_sample_without_persisting(  # type: ignore[no-untyped-def]
    db_session,
) -> None:
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        provider_id = _create_provider(client)
        source_id = _create_source(client, provider_id, "https://legit.example.com")

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=[
                    {
                        "productId": "1",
                        "productName": "Arroz Selecto 5lb",
                        "brand": "Selecto",
                        "items": [
                            {
                                "images": [{"imageUrl": "https://cdn.example.com/x.jpg"}],
                                "ean": "7890000000001",
                                "sellers": [{"commertialOffer": {"Price": 150.5}}],
                            }
                        ],
                        "categories": ["Alimentos/Arroz"],
                        "link": "https://legit.example.com/arroz-selecto",
                    }
                ],
            )

        addr = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]
        with (
            patch.object(ssrf_guard, "_make_client", lambda: httpx.Client(transport=httpx.MockTransport(handler))),
            patch("socket.getaddrinfo", return_value=addr),
        ):
            r = client.post(f"/v1/admin/save/sources/{source_id}/test", json={"query": "arroz"})

        assert r.status_code == 200, r.text
        sample = r.json()
        assert len(sample) == 1
        assert sample[0]["name"] == "Arroz Selecto 5lb"
        assert sample[0]["price_minor"] == 15050

        # zero-persistence de extremo a extremo: la muestra no debe existir en store_product
        from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository

        assert SqlStoreProductRepository(db_session).exists(provider_id, "1") is False
    finally:
        _clear()


def test_test_source_with_http_base_url_returns_422(db_session) -> None:  # type: ignore[no-untyped-def]
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        provider_id = _create_provider(client)
        source_id = _create_source(client, provider_id, "http://insecure.example.com")

        r = client.post(f"/v1/admin/save/sources/{source_id}/test", json={"query": "arroz"})

        assert r.status_code == 422, r.text
    finally:
        _clear()


def test_non_admin_gets_403_on_sources_health_route(db_session) -> None:  # type: ignore[no-untyped-def]
    """Batch 3E (3.18-3.19): mismo gate `ADMIN_SAVE_INGESTION_OPS` que el resto de `/sources/*`."""
    user_id = _seed_role_user(db_session, "normal_user")
    client = _client(db_session, user_id)
    try:
        assert client.get("/v1/admin/save/sources/health?market=DO").status_code == 403
    finally:
        _clear()


def test_super_admin_gets_health_badge_for_paused_and_stale_sources(  # type: ignore[no-untyped-def]
    db_session,
) -> None:
    admin_id = _seed_role_user(db_session, "super_admin")
    client = _client(db_session, admin_id)
    try:
        paused_provider_id = _create_provider(client)
        paused_source_id = _create_source(client, paused_provider_id, "https://jumbo.com.do")
        client.post(f"/v1/admin/save/sources/{paused_source_id}/pause")

        r = client.get("/v1/admin/save/sources/health?market=DO")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) == 1
        assert rows[0]["id"] == paused_source_id
        assert rows[0]["health"] == "paused"

        r_other_market = client.get("/v1/admin/save/sources/health?market=US")
        assert r_other_market.status_code == 200, r_other_market.text
        assert r_other_market.json() == []
    finally:
        _clear()

"""Integration — proxy de imágenes para el admin de Save.

Navegadores bloquean imágenes cross-origin (CORS) de tiendas externas. El backend las trae
filtrado por SSRF y content-type para que el admin pueda verlas sin exponer un proxy abierto.
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from seeds.identity_seed import seed_identity
from src.api.composition_root import get_session
from src.api.extensions.security import get_current_user_id
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
from src.contexts.save.infrastructure.catalog_sources.ssrf_guard import SsrfBlockedError
from src.main import app


def _seed_admin(db_session) -> str:  # type: ignore[no-untyped-def]
    seed_identity(db_session)
    user = UserModel(
        email=f"img-proxy-{uuid.uuid4().hex[:6]}@cuadra.do", name="img-proxy",
        home_market_id="DO", current_market_id="DO",
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserRoleModel(user_id=user.id, role_key="super_admin"))
    db_session.flush()
    return str(user.id)


def _get(db_session, user_id, url: str):  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as c:
            return c.get("/v1/admin/save/image-proxy", params={"url": url})
    finally:
        app.dependency_overrides.clear()


class TestImageProxy:
    def test_proxies_an_image_with_proper_content_type(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)
        url = "https://cdn.supermercadosnacional.com/img/123.jpg"

        with patch(
            "src.api.v1.controllers.admin_catalog.guarded_image_get",
            return_value=(b"fake-image-bytes", "image/jpeg"),
        ):
            res = _get(db_session, user_id, url)

        assert res.status_code == 200, res.text
        assert res.content == b"fake-image-bytes"
        assert res.headers["content-type"] == "image/jpeg"
        assert "public, max-age=3600" in res.headers["cache-control"]

    def test_blocks_non_https_urls(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)

        res = _get(db_session, user_id, "http://evil.com/image.jpg")

        assert res.status_code == 403

    def test_blocks_ssrf_guard_rejection(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)

        with patch(
            "src.api.v1.controllers.admin_catalog.guarded_image_get",
            side_effect=SsrfBlockedError("IP resuelta no permitida"),
        ):
            res = _get(db_session, user_id, "https://10.0.0.1/image.jpg")

        assert res.status_code == 403

    def test_returns_502_when_upstream_fails(self, db_session) -> None:  # type: ignore[no-untyped-def]
        user_id = _seed_admin(db_session)

        with patch(
            "src.api.v1.controllers.admin_catalog.guarded_image_get",
            side_effect=ConnectionError("upstream timeout"),
        ):
            res = _get(db_session, user_id, "https://cdn.example.com/img.jpg")

        assert res.status_code == 502

    def test_route_is_gated(self) -> None:
        """Sin capability/token no se puede usar como proxy abierto."""
        with TestClient(app) as c:
            res = c.get("/v1/admin/save/image-proxy", params={"url": "https://x.com/a.jpg"})
        assert res.status_code in (401, 403)

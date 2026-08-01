"""Integration — proxy público de imágenes para el sitio Save.

El sitio público sirve imágenes de tiendas a través del backend para evitar CORS. No requiere
autenticación porque el contenido es público, pero SÍ debe proteger contra SSRF y solo devolver
imágenes.
"""
from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from src.contexts.save.infrastructure.catalog_sources.ssrf_guard import SsrfBlockedError
from src.main import app


def test_public_proxy_returns_image() -> None:
    with patch(
        "src.api.v1.controllers.save.guarded_image_get",
        return_value=(b"fake-image-bytes", "image/jpeg"),
    ):
        with TestClient(app) as c:
            res = c.get("/v1/save/image-proxy", params={"url": "https://cdn.example.com/a.jpg"})

    assert res.status_code == 200
    assert res.content == b"fake-image-bytes"
    assert res.headers["content-type"] == "image/jpeg"


def test_public_proxy_blocks_ssrf() -> None:
    with patch(
        "src.api.v1.controllers.save.guarded_image_get",
        side_effect=SsrfBlockedError("IP resuelta no permitida"),
    ):
        with TestClient(app) as c:
            res = c.get("/v1/save/image-proxy", params={"url": "https://10.0.0.1/a.jpg"})

    assert res.status_code == 403


def test_public_proxy_returns_502_on_upstream_error() -> None:
    with patch(
        "src.api.v1.controllers.save.guarded_image_get",
        side_effect=ConnectionError("timeout"),
    ):
        with TestClient(app) as c:
            res = c.get("/v1/save/image-proxy", params={"url": "https://cdn.example.com/a.jpg"})

    assert res.status_code == 502

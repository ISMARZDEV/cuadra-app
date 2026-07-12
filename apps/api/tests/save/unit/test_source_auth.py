"""Unit — auth general de fuentes (§15.2): config `store_registry.auth` → headers/query de la request.

Modelo tipado (bearer/api_key/basic/none), patrón Postman/Insomnia. PURO (sin red). Cubre también el
enmascarado del secreto para lecturas/logs (§15.5): el token NUNCA se expone en claro.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.source_auth import (
    build_request_auth,
    mask_auth,
)

_DEFAULTS = {"User-Agent": "Cuadra/Save"}


def test_none_or_missing_auth_keeps_only_headers() -> None:
    ra = build_request_auth({"Host": "x.do"}, None, defaults=_DEFAULTS)
    assert ra.headers == {"User-Agent": "Cuadra/Save", "Host": "x.do"}
    assert ra.query == {}

    ra2 = build_request_auth(None, {"type": "none"}, defaults=_DEFAULTS)
    assert ra2.headers == {"User-Agent": "Cuadra/Save"} and ra2.query == {}


def test_bearer_sets_authorization_header() -> None:
    ra = build_request_auth(None, {"type": "bearer", "token": "abc123"}, defaults=_DEFAULTS)
    assert ra.headers["Authorization"] == "Bearer abc123"


def test_api_key_in_header() -> None:
    ra = build_request_auth(
        {"Host": "bravova-api"}, {"type": "api_key", "in": "header", "name": "X-Auth-Token", "value": "T0K"}
    )
    assert ra.headers["X-Auth-Token"] == "T0K"
    assert ra.headers["Host"] == "bravova-api"
    assert ra.query == {}


def test_api_key_in_query() -> None:
    ra = build_request_auth(None, {"type": "api_key", "in": "query", "name": "api_key", "value": "K9"})
    assert ra.query == {"api_key": "K9"}
    assert "api_key" not in ra.headers


def test_basic_builds_base64_authorization() -> None:
    import base64

    ra = build_request_auth(None, {"type": "basic", "username": "u", "password": "p"})
    expected = "Basic " + base64.b64encode(b"u:p").decode()
    assert ra.headers["Authorization"] == expected


def test_unknown_type_raises() -> None:
    import pytest

    with pytest.raises(ValueError):
        build_request_auth(None, {"type": "quantum"})


def test_mask_auth_hides_secrets_but_keeps_shape() -> None:
    assert mask_auth({"type": "bearer", "token": "abcd1234wxyz"}) == {"type": "bearer", "token": "••••wxyz"}
    assert mask_auth({"type": "api_key", "in": "header", "name": "X-Auth-Token", "value": "supersecret9"}) == {
        "type": "api_key", "in": "header", "name": "X-Auth-Token", "value": "••••ret9",
    }
    assert mask_auth({"type": "basic", "username": "u", "password": "hunter2"}) == {
        "type": "basic", "username": "u", "password": "••••",
    }
    assert mask_auth({"type": "none"}) == {"type": "none"}
    assert mask_auth(None) is None

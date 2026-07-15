"""Unit — auth general de fuentes (§15.2): config `store_registry.auth` → headers/query de la request.

Modelo tipado (bearer/api_key/basic/none), patrón Postman/Insomnia. PURO (sin red). Cubre también el
enmascarado del secreto para lecturas/logs (§15.5): el token NUNCA se expone en claro.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.source_auth import (
    RequestAuth,
    apply_query,
    authed_http_get,
    authed_http_post,
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


# --- transporte auth-aware (plumbing a los adapters) --------------------------------------------

class _FakeResp:
    def __init__(self, payload: object) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        pass

    def json(self) -> object:
        return self._payload


def test_apply_query_appends_params() -> None:
    assert apply_query("https://x.do/list", {"api_key": "K"}) == "https://x.do/list?api_key=K"
    assert apply_query("https://x.do/list?a=1", {"api_key": "K"}) == "https://x.do/list?a=1&api_key=K"
    assert apply_query("https://x.do/list", {}) == "https://x.do/list"


def test_authed_http_get_applies_headers_and_query() -> None:
    seen: dict[str, object] = {}

    def transport(method, url, *, headers=None, timeout=None, **kw):  # type: ignore[no-untyped-def]
        seen["method"] = method
        seen["url"] = url
        seen["headers"] = headers
        return _FakeResp([{"x": 1}])

    ra = RequestAuth({"X-Auth-Token": "T0K"}, {"api_key": "K9"})
    get = authed_http_get(ra, transport=transport)

    result = get("https://x.do/list")

    assert result == [{"x": 1}]
    assert seen["method"] == "GET"
    assert seen["headers"] == {"X-Auth-Token": "T0K"}
    assert "api_key=K9" in seen["url"]


def test_authed_http_post_merges_auth_over_per_call_headers() -> None:
    seen: dict[str, object] = {}

    def transport(method, url, *, json=None, headers=None, timeout=None, **kw):  # type: ignore[no-untyped-def]
        seen["headers"] = headers
        seen["json"] = json
        return _FakeResp({"data": 1})

    # auth trae User-Agent propio (Bravo/Domicilio) que debe GANAR sobre el del adapter
    ra = RequestAuth({"User-Agent": "Domicilio/1", "X-Auth-Token": "T"})
    post = authed_http_post(ra, transport=transport)

    result = post("https://x.do/graphql", {"q": 1}, {"Content-Type": "application/json", "User-Agent": "Cuadra/Save"})

    assert result == {"data": 1}
    assert seen["json"] == {"q": 1}
    assert seen["headers"]["Content-Type"] == "application/json"  # header funcional del adapter se conserva
    assert seen["headers"]["User-Agent"] == "Domicilio/1"          # auth gana
    assert seen["headers"]["X-Auth-Token"] == "T"


# --- la factory aplica la auth del registry a los adapters (plumbing §15) -----------------------

def test_factory_applies_registry_auth_to_vtex(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from src.contexts.save.domain.entities import SourcePlatform
    from src.contexts.save.infrastructure.catalog_sources import source_auth
    from src.contexts.save.infrastructure.catalog_sources.factory import CatalogSourceFactory

    seen: dict[str, object] = {}

    def fake(method, url, *, headers=None, timeout=None, **kw):  # type: ignore[no-untyped-def]
        seen["headers"] = headers
        return _FakeResp([])  # página vacía → fetch corta tras 1 request

    monkeypatch.setattr(source_auth, "request_with_retry", fake)

    builder = CatalogSourceFactory.build(
        SourcePlatform.VTEX, "https://sirena.do",
        auth={"type": "api_key", "in": "header", "name": "X-Auth-Token", "value": "SECRET"},
    )
    list(builder.for_query("p1", "DO", "arroz").fetch())

    assert seen["headers"]["X-Auth-Token"] == "SECRET"


def test_factory_without_credential_uses_adapter_default(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Sin auth ni headers → NO se inyecta transporte auth-aware (comportamiento previo intacto).
    from src.contexts.save.domain.entities import SourcePlatform
    from src.contexts.save.infrastructure.catalog_sources.factory import CatalogSourceFactory

    adapter = CatalogSourceFactory.build(SourcePlatform.MAGENTO, "https://nac.com").for_query(
        "p1", "DO", "arroz"
    )
    assert adapter._http_post.__name__ == "_default_post"  # usa su default, no el authed

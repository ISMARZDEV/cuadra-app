"""Auth general de fuentes de catálogo (§15.2): `store_registry.auth`/`headers` → request.

Modelo TIPADO (bearer / api_key / basic / none), patrón Postman/Insomnia/Airbyte — así la UI del admin
renderiza campos por tipo, valida, y ENMASCARA el secreto (§15.5). El valor vive en la BD (config),
NUNCA hardcodeado. Cubre súper de cualquier país que pidan Bearer o un header tipo `X-Auth-Token`.
OAuth2-refresh queda como extensión (un tipo nuevo que resuelve a un Bearer).

PURO: solo transforma config → headers/query. Sin red. Lo consumen los adapters (infra).
"""
from __future__ import annotations

import base64
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlencode

from .http_retry import request_with_retry


@dataclass(frozen=True, slots=True)
class RequestAuth:
    """Cómo aplicar la auth a UNA request: headers a mandar + params de query a agregar a la URL."""

    headers: dict[str, str]
    query: dict[str, str] = field(default_factory=dict)


def build_request_auth(
    headers: dict[str, str] | None,
    auth: dict[str, object] | None,
    *,
    defaults: dict[str, str] | None = None,
) -> RequestAuth:
    """Combina `defaults` + `headers` estáticos del registry + la credencial de `auth`.

    `defaults` (p.ej. `{"User-Agent": "Cuadra/Save"}`) van primero; `headers` del registry (Host,
    User-Agent propio) los sobreescriben; la auth se aplica encima. `api_key in=query` va a la URL,
    no a los headers. Un `type` desconocido es un error de config (falla ruidoso, no silencioso).
    """
    result: dict[str, str] = {**(defaults or {}), **(headers or {})}
    query: dict[str, str] = {}

    kind = (auth or {}).get("type", "none")
    if kind in (None, "none"):
        return RequestAuth(result, query)
    if kind == "bearer":
        result["Authorization"] = f"Bearer {auth['token']}"  # type: ignore[index]
    elif kind == "api_key":
        name = str(auth["name"])  # type: ignore[index]
        value = str(auth["value"])  # type: ignore[index]
        if auth.get("in") == "query":  # type: ignore[union-attr]
            query[name] = value
        else:
            result[name] = value
    elif kind == "basic":
        raw = f"{auth['username']}:{auth['password']}".encode()  # type: ignore[index]
        result["Authorization"] = "Basic " + base64.b64encode(raw).decode()
    else:
        raise ValueError(f"tipo de auth de fuente no soportado: {kind!r}")
    return RequestAuth(result, query)


def apply_query(url: str, query: dict[str, str]) -> str:
    """Agrega los params de query (p.ej. `api_key`) a la URL, respetando un `?` existente."""
    if not query:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{urlencode(query)}"


def authed_http_get(
    request_auth: RequestAuth,
    *,
    transport: Callable[..., object] | None = None,
    timeout: float = 30.0,
) -> Callable[[str], object]:
    """`http_get` de un adapter, con la auth del registry aplicada (headers + query). `transport`
    inyectable = testeable sin red; None → `request_with_retry` (backoff/reintentos de F3.3)."""

    def _get(url: str) -> object:
        t = transport or request_with_retry
        resp = t("GET", apply_query(url, request_auth.query), headers=request_auth.headers, timeout=timeout)
        resp.raise_for_status()  # type: ignore[attr-defined]
        return resp.json()  # type: ignore[attr-defined]

    return _get


def authed_http_post(
    request_auth: RequestAuth,
    *,
    transport: Callable[..., object] | None = None,
    timeout: float = 30.0,
) -> Callable[[str, dict, dict[str, str]], object]:
    """`http_post` de un adapter (Magento): mezcla los headers de auth SOBRE los per-call del adapter
    (Content-Type/Store se conservan; User-Agent/token del registry ganan)."""

    def _post(url: str, payload: dict, headers: dict[str, str]) -> object:
        t = transport or request_with_retry
        merged = {**headers, **request_auth.headers}
        resp = t("POST", apply_query(url, request_auth.query), json=payload, headers=merged, timeout=timeout)
        resp.raise_for_status()  # type: ignore[attr-defined]
        return resp.json()  # type: ignore[attr-defined]

    return _post


def _mask(secret: str) -> str:
    """`••••` + los últimos 4 (o todo enmascarado si es corto). Nunca revela el secreto completo."""
    s = str(secret)
    return "••••" + s[-4:] if len(s) > 4 else "••••"


def mask_auth(auth: dict[str, object] | None) -> dict[str, object] | None:
    """Copia de `auth` con el secreto ENMASCARADO — para respuestas de lectura del admin y logs
    (§15.5). Preserva la forma (type/name/username visibles) para que la UI la renderice."""
    if not auth:
        return auth
    masked = dict(auth)
    kind = auth.get("type")
    if kind == "bearer" and "token" in masked:
        masked["token"] = _mask(str(masked["token"]))
    elif kind == "api_key" and "value" in masked:
        masked["value"] = _mask(str(masked["value"]))
    elif kind == "basic" and "password" in masked:
        masked["password"] = "••••"
    return masked

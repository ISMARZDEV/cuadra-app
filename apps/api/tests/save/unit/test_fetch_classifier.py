"""Unit — clasificador de errores de fetch (F3.3): httpx → `FetchOutcome` tipado.

Patrón SRD `result.ts:9-69`: el job decide reintentar/ocultar SOLO leyendo los flags `retryable`/
`hide`, nunca inspeccionando el error crudo. Acá se prueba la ÚNICA capa que traduce el error httpx
a esos flags (infra, httpx-aware); el use-case (`CoverCanonicals`) solo lee `outcome.retryable`.
"""
from __future__ import annotations

import httpx

from src.contexts.save.domain.fetch_outcome import FetchErrorKind
from src.contexts.save.infrastructure.catalog_sources.fetch_classifier import (
    classify_httpx_error,
)


def _status_error(code: int) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://tienda.example")
    resp = httpx.Response(code, request=req)
    return httpx.HTTPStatusError(f"HTTP {code}", request=req, response=resp)


def test_503_is_retryable_backend_down() -> None:
    outcome = classify_httpx_error(_status_error(503))

    assert outcome.kind is FetchErrorKind.BACKEND_DOWN
    assert outcome.retryable is True


def test_429_rate_limit_is_retryable() -> None:
    assert classify_httpx_error(_status_error(429)).retryable is True


def test_timeout_is_retryable_backend_down() -> None:
    outcome = classify_httpx_error(httpx.TimeoutException("read timeout"))

    assert outcome.kind is FetchErrorKind.BACKEND_DOWN
    assert outcome.retryable is True


def test_transport_error_is_retryable() -> None:
    assert classify_httpx_error(httpx.ConnectError("connection refused")).retryable is True


def test_404_is_not_found_hide_and_not_retryable() -> None:
    outcome = classify_httpx_error(_status_error(404))

    assert outcome.kind is FetchErrorKind.NOT_FOUND
    assert outcome.hide is True
    assert outcome.retryable is False


def test_unknown_error_is_fatal_and_not_retryable() -> None:
    outcome = classify_httpx_error(ValueError("parse error"))

    assert outcome.kind is FetchErrorKind.FATAL
    assert outcome.retryable is False


def test_403_is_auth_failed_not_retryable() -> None:
    # Token de fuente ausente/vencido → NO es backend caído ni fatal: se cae al fallback (browse).
    outcome = classify_httpx_error(_status_error(403))

    assert outcome.kind is FetchErrorKind.AUTH_FAILED
    assert outcome.retryable is False


def test_401_is_auth_failed() -> None:
    assert classify_httpx_error(_status_error(401)).kind is FetchErrorKind.AUTH_FAILED

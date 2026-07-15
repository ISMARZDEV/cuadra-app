"""Unit — HTTP con reintentos de los adapters (F3.3, patrón SRD http-client.ts). `sleep` inyectado
→ sin esperas reales. Mockea `httpx.request` a nivel de módulo (nunca red)."""
from __future__ import annotations

from unittest.mock import Mock

import httpx
import pytest

from src.contexts.save.infrastructure.catalog_sources.http_retry import (
    backoff_delay,
    request_with_retry,
)


def test_backoff_grows_and_is_capped_with_jitter() -> None:
    # jitter ∈ [0.5, 1.5) → un intento alto (topeado en cap=8) nunca supera 8×1.5.
    assert 0 < backoff_delay(0) < 0.5 * 1.5 + 1e-9
    assert backoff_delay(10) <= 8.0 * 1.5


def test_retries_on_503_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = [Mock(status_code=503), Mock(status_code=503), Mock(status_code=200)]
    calls: list[str] = []

    def fake_request(method, url, **kw):  # type: ignore[no-untyped-def]
        calls.append(method)
        return responses[len(calls) - 1]

    monkeypatch.setattr(httpx, "request", fake_request)
    sleeps: list[float] = []

    resp = request_with_retry("GET", "https://x.example/y", sleep=lambda d: sleeps.append(d))

    assert resp.status_code == 200
    assert len(calls) == 3  # reintentó dos veces antes del 200
    assert len(sleeps) == 2  # un backoff por reintento


def test_does_not_retry_a_404(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_request(method, url, **kw):  # type: ignore[no-untyped-def]
        calls.append(method)
        return Mock(status_code=404)

    monkeypatch.setattr(httpx, "request", fake_request)

    resp = request_with_retry("GET", "https://x.example/y", sleep=lambda _d: None)

    assert resp.status_code == 404
    assert len(calls) == 1  # 404 es determinista → no reintenta


def test_retries_on_timeout_then_raises_after_max(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_request(method, url, **kw):  # type: ignore[no-untyped-def]
        calls.append(method)
        raise httpx.ConnectTimeout("boom")

    monkeypatch.setattr(httpx, "request", fake_request)

    with pytest.raises(httpx.ConnectTimeout):
        request_with_retry("GET", "https://x.example/y", sleep=lambda _d: None)
    assert len(calls) == 3  # agotó los 3 intentos

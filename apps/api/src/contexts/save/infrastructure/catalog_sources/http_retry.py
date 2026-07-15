"""HTTP con reintentos para los adapters de ingesta (F3.3 — resiliencia, patrón SRD
`http-client.ts:497-524`).

Reintenta en errores REINTENTABLES (429 / 5xx transitorios / timeouts de red) con backoff exponencial
+ jitter, para no tumbar un host bajo presión ni fallar por un pico transitorio cuando Loop B corre
alta-frecuencia sobre N tiendas. Un 4xx no-reintentable (404/400) se devuelve tal cual (no reintenta).
`sleep` es inyectable → testeable sin esperas reales.
"""
from __future__ import annotations

import random
import ssl
import time
from collections.abc import Callable

import httpx

# TLS: verifica con el trust store del SISTEMA (no solo certifi). Algunas APIs de súper (Bravo)
# mandan una cadena con un intermedio que certifi NO trae pero el OS sí → certifi falla con
# "self-signed certificate in chain" aunque `openssl` valide OK. `truststore` lo resuelve SIN
# desactivar la verificación (sigue seguro). Sin truststore → certifi por defecto (fallback).
try:
    import truststore

    _SSL_VERIFY: "ssl.SSLContext | bool" = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover — truststore vive en el grupo `ingestion`
    _SSL_VERIFY = True

# 429 (rate limit) + 5xx transitorios. Un 404/400 NO se reintenta (es determinista).
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3
_BASE_DELAY = 0.5
_CAP_DELAY = 8.0


def backoff_delay(attempt: int, *, base: float = _BASE_DELAY, cap: float = _CAP_DELAY) -> float:
    """PURO: backoff exponencial (base·2^intento) topado en `cap`, con jitter [0.5, 1.5)×."""
    exp = min(cap, base * (2**attempt))
    return exp * (0.5 + random.random())


def request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict | None = None,
    json: object | None = None,
    timeout: float = 30.0,
    max_attempts: int = _MAX_ATTEMPTS,
    sleep: Callable[[float], None] = time.sleep,
) -> httpx.Response:
    """GET/POST con reintentos en 429/5xx/timeout. Devuelve la `Response` final (el caller hace
    `raise_for_status`/`json`). Propaga el error de red si agota los intentos."""
    last_exc: Exception | None = None
    resp: httpx.Response | None = None
    for attempt in range(max_attempts):
        try:
            resp = httpx.request(
                method, url, headers=headers, json=json, timeout=timeout, verify=_SSL_VERIFY
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt == max_attempts - 1:
                raise
            sleep(backoff_delay(attempt))
            continue
        if resp.status_code in _RETRYABLE_STATUS and attempt < max_attempts - 1:
            sleep(backoff_delay(attempt))
            continue
        return resp
    if resp is not None:  # pragma: no cover — el loop siempre retorna o levanta antes
        return resp
    raise last_exc  # type: ignore[misc]

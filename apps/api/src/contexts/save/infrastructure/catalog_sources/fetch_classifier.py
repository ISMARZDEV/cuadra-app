"""Clasificador de errores de fetch (F3.3, infra) — la ÚNICA capa que conoce `httpx`.

Traduce el error crudo de un adapter (tras agotar los reintentos de `http_retry`) al value object
PURO `FetchOutcome`. A partir de ahí el use-case decide con los flags, nunca con el error crudo
(patrón SRD `result.ts:9-69`). Referencia: Nacional `503 backend read error` → retryable + abort de
la tienda (SRD §3.1 `backend_503`); redirect/404 → not_found + hide.
"""
from __future__ import annotations

import httpx

from ...domain.fetch_outcome import FetchErrorKind, FetchOutcome

# 429 (rate limit) + 5xx transitorios: la tienda está bajo presión / caída → abortarla esta corrida.
_BACKEND_DOWN_STATUS = frozenset({429, 500, 502, 503, 504})


def classify_httpx_error(exc: Exception) -> FetchOutcome:
    """Mapa error → outcome tipado. Un timeout/transport-error o un 5xx/429 = backend caído
    (retryable → abortar tienda). Un 404 = no encontrado (hide, NO abortar). Cualquier otro = fatal."""
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return FetchOutcome(kind=FetchErrorKind.BACKEND_DOWN, retryable=True, hide=False)
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in _BACKEND_DOWN_STATUS:
            return FetchOutcome(kind=FetchErrorKind.BACKEND_DOWN, retryable=True, hide=False)
        if status == 404:
            return FetchOutcome(kind=FetchErrorKind.NOT_FOUND, retryable=False, hide=True)
    return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)

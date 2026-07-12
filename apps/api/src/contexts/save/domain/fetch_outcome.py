"""Resultado tipado de un fetch de ingesta (F3.3), PURO (ADR 31) — patrón SRD `result.ts:9-69`.

El job de cobertura (Loop B / `CoverCanonicals`) decide reintentar / abortar la tienda / ocultar
SOLO leyendo estos flags, NUNCA inspeccionando el error crudo. La ÚNICA capa que traduce un error
concreto (httpx) a este value object es el clasificador de infraestructura (`fetch_classifier`);
así el dominio y la aplicación quedan libres de `httpx`.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FetchErrorKind(str, Enum):
    BACKEND_DOWN = "backend_down"  # 5xx / 429 / timeout / red → transitorio → abortar la tienda
    NOT_FOUND = "not_found"        # 404 / redirect a host ajeno → ocultar, NO abortar la tienda
    FATAL = "fatal"               # cualquier otro (bug, parseo) → NO reintentable, propaga


@dataclass(frozen=True, slots=True)
class FetchOutcome:
    kind: FetchErrorKind
    retryable: bool  # → el job aborta la tienda (no la martilla más en esta corrida)
    hide: bool       # → la persistencia oculta el producto (no lo borra)

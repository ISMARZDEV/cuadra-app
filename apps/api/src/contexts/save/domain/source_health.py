"""Salud EFECTIVA de una fuente (F2·B1/B3, Batch 3E, tareas 3.18-3.19). PURO (ADR 31).

Derivada a LECTURA — no hay job de background en el pipeline (checkpoint 3.17: `ingestion/save/
assets.py` no tiene ningún hook de detección de rotura de esquema/error-rate/freshness). Dos
señales REALES únicamente:
  1. Pausa MANUAL de un admin (`enabled`/`paused_at`, persistida desde Batch 3B).
  2. Frescura de `store_product.last_seen_at` (se refresca en cada `record_observation`, doc 10).

Auto-detección de rotura de esquema y tasa de error quedan EXPLÍCITAMENTE fuera de alcance — no
existe esa señal en el pipeline hoy; fabricarla sería inventar un dato que no está.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from .entities import StoreRegistry

# Cadence de ingesta esperado es diario; 24h + margen operativo antes de marcar STALE.
STALENESS_THRESHOLD = timedelta(hours=24)


class SourceHealth(StrEnum):
    PAUSED = "paused"
    STALE = "stale"
    OK = "ok"


def derive_source_health(
    *,
    paused: bool,
    max_last_seen_at: datetime | None,
    now: datetime,
    staleness_threshold: timedelta = STALENESS_THRESHOLD,
) -> SourceHealth:
    """Pausa manual gana siempre; si no, frescura. `None` (nunca ingerido) cuenta como STALE."""
    if paused:
        return SourceHealth.PAUSED
    if max_last_seen_at is None or now - max_last_seen_at > staleness_threshold:
        return SourceHealth.STALE
    return SourceHealth.OK


@dataclass(frozen=True, slots=True)
class SourceHealthRow:
    """Read model: una fuente (`store_registry`) + su salud efectiva (Batch 3E) + los datos del
    proveedor (nombre + logo) para la UI (cards/lista)."""

    source: StoreRegistry
    health: SourceHealth
    provider_name: str = ""
    logo_url: str | None = None

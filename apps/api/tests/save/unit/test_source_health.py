"""Unit — derivación PURA del badge de salud efectiva de una fuente (F2·B1/B3, Batch 3E, 3.18-3.19).

Dos señales reales: pausa manual (persistida desde 3B) y frescura (`store_product.last_seen_at`).
NO hay auto-detección de rotura de esquema ni tasa de error (checkpoint 3.17, fuera de alcance).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.contexts.save.domain.source_health import SourceHealth, derive_source_health

_NOW = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)


def test_paused_wins_regardless_of_freshness() -> None:
    health = derive_source_health(paused=True, max_last_seen_at=_NOW, now=_NOW)
    assert health is SourceHealth.PAUSED


def test_fresh_observation_is_ok() -> None:
    health = derive_source_health(
        paused=False, max_last_seen_at=_NOW - timedelta(hours=1), now=_NOW
    )
    assert health is SourceHealth.OK


def test_older_than_threshold_is_stale() -> None:
    health = derive_source_health(
        paused=False, max_last_seen_at=_NOW - timedelta(hours=25), now=_NOW
    )
    assert health is SourceHealth.STALE


def test_never_ingested_is_stale_without_crashing() -> None:
    health = derive_source_health(paused=False, max_last_seen_at=None, now=_NOW)
    assert health is SourceHealth.STALE


def test_exactly_at_threshold_boundary_is_still_ok() -> None:
    health = derive_source_health(
        paused=False, max_last_seen_at=_NOW - timedelta(hours=24), now=_NOW
    )
    assert health is SourceHealth.OK

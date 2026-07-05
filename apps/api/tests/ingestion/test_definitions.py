"""Unit — DAG de Dagster (ingestion.definitions): valida la FORMA del grafo, sin red ni DB.

Requiere el dependency-group `ingestion` (dagster); en CI (que no lo sincroniza) el test se
SALTA con importorskip. La materialización real contra red/DB es manual (`dagster dev` /
`make save-refresh`), no parte del gate — el gate cubre la lógica pura (sources + runner).
"""
from __future__ import annotations

import pytest

pytest.importorskip("dagster")

from dagster import AssetKey  # noqa: E402

from ingestion.definitions import defs  # noqa: E402

_SOURCE_KEYS = ("sirena", "nacional", "jumbo")


def test_exposes_one_asset_per_source_plus_drops() -> None:
    keys = defs.resolve_asset_graph().get_all_asset_keys()
    for source in _SOURCE_KEYS:
        assert AssetKey(f"{source}_prices") in keys
    assert AssetKey("price_drops") in keys


def test_price_drops_depends_on_all_sources() -> None:
    graph = defs.resolve_asset_graph()
    parents = graph.get(AssetKey("price_drops")).parent_keys
    for source in _SOURCE_KEYS:
        assert AssetKey(f"{source}_prices") in parents


def test_daily_schedule_targets_the_catalog_job() -> None:
    schedule = defs.get_schedule_def("save_daily_refresh")
    assert schedule.cron_schedule == "0 6 * * *"

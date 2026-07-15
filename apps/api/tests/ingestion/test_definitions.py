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


def test_exposes_one_asset_per_source_plus_drops_and_alert_matching() -> None:
    keys = defs.resolve_asset_graph().get_all_asset_keys()
    for source in _SOURCE_KEYS:
        assert AssetKey(f"{source}_prices") in keys
    assert AssetKey("embed_canonicals") in keys
    assert AssetKey("price_drops") in keys
    assert AssetKey("alert_matching") in keys


def test_sources_depend_on_embed_canonicals() -> None:
    # el índice semántico debe poblarse ANTES del matching que corre en cada fuente
    graph = defs.resolve_asset_graph()
    for source in _SOURCE_KEYS:
        parents = graph.get(AssetKey(f"{source}_prices")).parent_keys
        assert AssetKey("embed_canonicals") in parents


def test_rest_catalog_prices_asset_exists_and_depends_on_embed_canonicals() -> None:
    # Browse-full de las fuentes REST_CATALOG (Bravo y afines), registry-driven (no hardcodeado).
    # El matching corre en el refresh → necesita el índice semántico poblado antes.
    graph = defs.resolve_asset_graph()
    assert AssetKey("rest_catalog_prices") in graph.get_all_asset_keys()
    assert AssetKey("embed_canonicals") in graph.get(AssetKey("rest_catalog_prices")).parent_keys


def test_rest_catalog_prices_is_partitioned_by_section() -> None:
    # Particionado dinámico por sección ({provider}:{section}) → cada sección se materializa/reintenta
    # por separado; el sensor sincroniza las particiones desde store_registry.
    graph = defs.resolve_asset_graph()
    partitions_def = graph.get(AssetKey("rest_catalog_prices")).partitions_def
    assert partitions_def is not None
    assert partitions_def.name == "rest_catalog_section"


def test_rest_catalog_has_partitioned_job_and_sync_sensor() -> None:
    assert defs.get_job_def("save_rest_catalog") is not None
    assert defs.get_sensor_def("sync_rest_catalog_sections") is not None


def test_price_refresh_asset_job_and_schedule_exist() -> None:
    # Prices Batch (SRD): re-precio por id de TODO lo conocido; ritmo propio, no en el daily.
    assert AssetKey("price_refresh") in defs.resolve_asset_graph().get_all_asset_keys()
    assert defs.get_job_def("save_price_refresh") is not None
    assert defs.get_schedule_def("save_price_refresh_frequent").cron_schedule == "0 */4 * * *"


def test_price_drops_depends_on_all_sources() -> None:
    graph = defs.resolve_asset_graph()
    parents = graph.get(AssetKey("price_drops")).parent_keys
    for source in _SOURCE_KEYS:
        assert AssetKey(f"{source}_prices") in parents
    assert AssetKey("rest_catalog_prices") in parents  # Bravo y afines también alimentan las bajadas


def test_alert_matching_depends_on_all_sources() -> None:
    graph = defs.resolve_asset_graph()
    parents = graph.get(AssetKey("alert_matching")).parent_keys
    for source in _SOURCE_KEYS:
        assert AssetKey(f"{source}_prices") in parents
    assert AssetKey("rest_catalog_prices") in parents


def test_daily_schedule_targets_the_catalog_job() -> None:
    schedule = defs.get_schedule_def("save_daily_refresh")
    assert schedule.cron_schedule == "0 6 * * *"


def test_coverage_asset_exists_and_depends_on_embed_canonicals() -> None:
    # Loop B (F3.1): la cobertura valida los candidatos con la cascada → necesita el índice semántico.
    graph = defs.resolve_asset_graph()
    assert AssetKey("coverage") in graph.get_all_asset_keys()
    assert AssetKey("embed_canonicals") in graph.get(AssetKey("coverage")).parent_keys


def test_coverage_has_its_own_schedule() -> None:
    # Ritmo propio de Loop B (equivalente al Prices Batch de SRD), separado del refresh diario.
    schedule = defs.get_schedule_def("save_coverage_daily")
    assert schedule.cron_schedule == "0 4 * * *"

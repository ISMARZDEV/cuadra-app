"""Unit — DAG de Dagster (ingestion.definitions): valida la FORMA del grafo, sin red ni DB.

Requiere el dependency-group `ingestion` (dagster); en CI (que no lo sincroniza) el test se
SALTA con importorskip. La materialización real contra red/DB es manual (`dagster dev` /
`make save-refresh`), no parte del gate — el gate cubre la lógica pura (sources + runner).

R1 (2026-07-16): ya NO hay un asset por tienda hardcodeado (`sirena_prices`/`nacional_prices`/
`jumbo_prices`). El descubrimiento es UN asset particionado por proveedor (`query_catalog_prices`),
cuyas particiones el sensor deriva de `store_registry` — sumar un súper es una FILA, no un deploy.
"""
from __future__ import annotations

import pytest

pytest.importorskip("dagster")

import dagster as dg  # noqa: E402
from dagster import AssetKey  # noqa: E402

from ingestion.definitions import defs  # noqa: E402


def test_discovery_is_one_partitioned_asset_not_one_per_hardcoded_store() -> None:
    keys = defs.resolve_asset_graph().get_all_asset_keys()
    assert AssetKey("query_catalog_prices") in keys
    assert AssetKey("embed_canonicals") in keys
    assert AssetKey("price_drops") in keys
    assert AssetKey("alert_matching") in keys
    # El tuple hardcodeado murió: las tiendas salen del registry.
    for gone in ("sirena_prices", "nacional_prices", "jumbo_prices"):
        assert AssetKey(gone) not in keys, f"{gone} sigue existiendo: el hardcode no murió"


def test_discovery_is_partitioned_by_provider() -> None:
    # Particionado dinámico por proveedor → cada tienda se materializa/reintenta por separado (el
    # aislamiento que daban los 3 assets separados), pero el SET sale de `store_registry`.
    graph = defs.resolve_asset_graph()
    partitions_def = graph.get(AssetKey("query_catalog_prices")).partitions_def
    assert partitions_def is not None
    assert partitions_def.name == "query_catalog_provider"


def test_discovery_depends_on_embed_canonicals() -> None:
    # El índice semántico debe poblarse ANTES del matching que corre en cada fuente.
    graph = defs.resolve_asset_graph()
    assert AssetKey("embed_canonicals") in graph.get(AssetKey("query_catalog_prices")).parent_keys


def test_discovery_has_a_partitioned_job_and_a_sync_sensor() -> None:
    # Job propio para materializar/backfillear a mano una tienda (un asset particionado no puede
    # vivir en un job unpartitioned); el sensor mantiene las particiones al día desde el registry.
    assert defs.get_job_def("save_query_catalog") is not None
    assert defs.get_sensor_def("sync_query_catalog_providers") is not None


def test_rest_catalog_prices_asset_exists_and_depends_on_embed_canonicals() -> None:
    # Browse-full de las fuentes REST_CATALOG (Bravo y afines), registry-driven (no hardcodeado).
    # CONVIVE con el descubrimiento por-query (decisión 2026-07-16): la canasta trae la versión Bravo
    # de lo que se compara; el browse descubre los EXCLUSIVOS que la canasta nunca pediría.
    graph = defs.resolve_asset_graph()
    assert AssetKey("rest_catalog_prices") in graph.get_all_asset_keys()
    assert AssetKey("embed_canonicals") in graph.get(AssetKey("rest_catalog_prices")).parent_keys


def test_rest_catalog_prices_is_partitioned_by_section() -> None:
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


def test_price_drops_depends_on_both_discovery_paths() -> None:
    graph = defs.resolve_asset_graph()
    parents = graph.get(AssetKey("price_drops")).parent_keys
    assert AssetKey("query_catalog_prices") in parents
    assert AssetKey("rest_catalog_prices") in parents  # Bravo y afines también alimentan las bajadas


def test_alert_matching_depends_on_both_discovery_paths() -> None:
    graph = defs.resolve_asset_graph()
    parents = graph.get(AssetKey("alert_matching")).parent_keys
    assert AssetKey("query_catalog_prices") in parents
    assert AssetKey("rest_catalog_prices") in parents


def test_coverage_asset_exists_and_depends_on_embed_canonicals() -> None:
    # Loop B (F3.1): la cobertura valida los candidatos con la cascada → necesita el índice semántico.
    graph = defs.resolve_asset_graph()
    assert AssetKey("coverage") in graph.get_all_asset_keys()
    assert AssetKey("embed_canonicals") in graph.get(AssetKey("coverage")).parent_keys


def test_coverage_has_its_own_schedule() -> None:
    # Ritmo propio de Loop B (equivalente al Prices Batch de SRD), separado del descubrimiento.
    schedule = defs.get_schedule_def("save_coverage_daily")
    assert schedule.cron_schedule == "0 4 * * *"


# ── Automatización declarativa: el orden lo da la DEPENDENCIA, no el reloj ─────────────────────
# Antes, un solo job diario encadenaba embed → fuentes → drops con deps reales, en una corrida.
# Particionar el descubrimiento lo saca de ese job (Dagster no mezcla assets particionados y no
# particionados en un mismo job), así que la cadena había que reconstruirla.
#
# La alternativa era encadenar por RELOJ (05:00 embed → 06:00 query → 07:00 drops). Se descartó: si
# embed tarda más de la cuenta, el descubrimiento corre igual sobre un índice viejo y NADIE se
# entera. Esa es la forma exacta de los bugs que esta fase viene destapando — no rompen, mienten en
# verde. La condición declarativa no puede mentir: `eager` no dispara hasta que el padre TERMINÓ.


def test_the_daily_chain_starts_from_a_cron_on_embed_not_from_a_schedule() -> None:
    # `embed_canonicals` es la cabeza de la cadena: es el único con cron. El resto lo arrastra.
    graph = defs.resolve_asset_graph()
    condition = graph.get(AssetKey("embed_canonicals")).automation_condition
    assert condition is not None
    assert "0 6 * * *" in str(condition)


def test_discovery_waits_for_the_semantic_index_instead_of_a_clock() -> None:
    graph = defs.resolve_asset_graph()
    condition = graph.get(AssetKey("query_catalog_prices")).automation_condition
    assert condition is not None, "sin condición, el descubrimiento no arranca solo"


def test_drops_are_not_blocked_forever_by_the_manual_rest_browse() -> None:
    """EL gotcha de `eager()`: 'will not execute targets that have any MISSING dependencies'.

    `price_drops` depende también de `rest_catalog_prices`, que es el browse MANUAL de Bravo. En un
    deploy nuevo sus particiones nunca se materializaron → están 'missing' → `eager()` bloquearía
    `price_drops` PARA SIEMPRE, y las alertas de bajada de precio no saldrían nunca. Hoy corren
    igual porque el job diario no mira eso.

    Por eso la condición es `eager` MENOS la guarda `~any_deps_missing`: espera a que lo que corrió
    TERMINE (`~any_deps_in_progress`), pero no exige que TODO haya corrido alguna vez.
    """
    graph = defs.resolve_asset_graph()
    for key in ("price_drops", "alert_matching"):
        condition = graph.get(AssetKey(key)).automation_condition
        assert condition is not None, f"{key} sin condición: no se dispararía nunca"
        assert "any_deps_missing" not in str(condition), (
            f"{key} hereda la guarda de deps faltantes: el browse manual de Bravo lo trabaría"
        )
        assert "any_deps_in_progress" in str(condition), (
            f"{key} no espera a que el descubrimiento termine → contaría bajadas a medio ingerir"
        )


def test_an_automation_sensor_evaluates_the_conditions() -> None:
    # Sin sensor, las condiciones son decoración: nadie las evalúa y la cadena no arranca nunca.
    sensor = defs.get_sensor_def("save_automation")
    assert sensor is not None
    assert sensor.default_status == dg.DefaultSensorStatus.RUNNING


def test_the_old_clock_driven_daily_schedule_is_gone() -> None:
    # Convivir con el cron viejo dispararía la cadena DOS veces (el schedule + la condición).
    with pytest.raises(Exception):
        defs.get_schedule_def("save_daily_refresh")


def test_discovery_asset_wires_a_real_pace_into_the_runner() -> None:
    """El descubrimiento dispara UNA búsqueda por término de canasta (hoy 213) contra la MISMA
    tienda. Sin pausa es un martilleo — el bug que costó los 429 de Bravo. Este test falla si
    alguien desconecta el pacing del asset: una salvaguarda sin test de wiring no existe.

    `@dg.asset` devuelve un `AssetsDefinition`, no la función → se baja al `compute_fn` decorado.
    """
    import inspect

    from ingestion.save import assets

    src = inspect.getsource(assets.query_catalog_prices.op.compute_fn.decorated_fn)
    assert "pace=build_pace()" in src, "el asset de descubrimiento debe pasarle la pausa real al runner"

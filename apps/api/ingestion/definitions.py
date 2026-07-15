"""`Definitions` de Dagster — punto de entrada del orquestador (`dagster dev -m ingestion.definitions`).

Un job que materializa todo el grafo de Save + una schedule diaria (interino: un solo ritmo; el
doble ritmo canasta/full-semanal de doc 06 §7 se suma cuando el catálogo crezca).
"""
from __future__ import annotations

import dagster as dg

from ingestion.save.assets import (
    alert_matching,
    coverage,
    embed_canonicals,
    freshness,
    price_drops,
    price_refresh,
    rest_catalog_prices,
    rest_catalog_sections,
    source_assets,
    sync_rest_catalog_sections,
)

# El refresh diario materializa TODO menos los assets de ritmo propio: `coverage` (Loop B),
# `freshness`/`price_refresh` (re-precio por id, cadencia frecuente) y `rest_catalog_prices`
# (particionado → backfill de secciones en su propio job).
save_catalog_job = dg.define_asset_job(
    "save_catalog_refresh",
    selection=dg.AssetSelection.all()
    - dg.AssetSelection.assets("coverage", "freshness", "price_refresh", "rest_catalog_prices"),
)
# Browse REST_CATALOG particionado por sección — se dispara por partición o backfill (UI), no en el
# refresh diario unpartitioned. El sensor mantiene las particiones al día desde store_registry.
save_rest_catalog_job = dg.define_asset_job(
    "save_rest_catalog",
    selection=dg.AssetSelection.assets("rest_catalog_prices"),
    partitions_def=rest_catalog_sections,
)
save_coverage_job = dg.define_asset_job(
    "save_coverage",
    selection=dg.AssetSelection.assets("embed_canonicals", "coverage"),
)
save_freshness_job = dg.define_asset_job(
    "save_freshness",
    selection=dg.AssetSelection.assets("freshness"),  # F3.2a: NO depende de embed_canonicals
)
save_price_refresh_job = dg.define_asset_job(
    "save_price_refresh",
    selection=dg.AssetSelection.assets("price_refresh"),  # re-precio por id de TODO lo conocido
)

save_daily_refresh = dg.ScheduleDefinition(
    name="save_daily_refresh",
    job=save_catalog_job,
    cron_schedule="0 6 * * *",  # 06:00 diario (interino)
)
save_coverage_daily = dg.ScheduleDefinition(
    name="save_coverage_daily",
    job=save_coverage_job,
    cron_schedule="0 4 * * *",  # 04:00 diario — Loop B llena la matriz de cobertura (F3.1)
)
save_freshness_frequent = dg.ScheduleDefinition(
    name="save_freshness_frequent",
    job=save_freshness_job,
    cron_schedule="0 */2 * * *",  # cada 2h — precios de lo CUBIERTO+viejo (F3.2a, user-facing prioritario)
)
# Two-tier: `freshness` (covered, 2h) mantiene fresco lo que el usuario VE; `price_refresh` (TODO lo
# conocido, 4h) alcanza además la cola de revisión. Superset (change-only → el solapamiento es inocuo);
# para prod tunear/consolidar cadencias.
save_price_refresh_frequent = dg.ScheduleDefinition(
    name="save_price_refresh_frequent",
    job=save_price_refresh_job,
    cron_schedule="0 */4 * * *",  # cada 4h — re-precio por id de TODO lo conocido (Prices Batch, SRD §3.1)
)

defs = dg.Definitions(
    assets=[
        embed_canonicals,
        *source_assets,
        rest_catalog_prices,
        coverage,
        freshness,
        price_refresh,
        price_drops,
        alert_matching,
    ],
    jobs=[
        save_catalog_job, save_rest_catalog_job, save_coverage_job,
        save_freshness_job, save_price_refresh_job,
    ],
    schedules=[
        save_daily_refresh, save_coverage_daily, save_freshness_frequent, save_price_refresh_frequent,
    ],
    sensors=[sync_rest_catalog_sections],
)

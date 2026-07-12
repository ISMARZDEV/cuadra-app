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
    source_assets,
)

# El refresh diario materializa TODO menos `coverage` (Loop B) y `freshness` (F3.2a) — cada uno tiene
# su propio ritmo (equivalentes al Prices Batch de SRD, separados del refresh amplio de Loop A).
save_catalog_job = dg.define_asset_job(
    "save_catalog_refresh",
    selection=dg.AssetSelection.all() - dg.AssetSelection.assets("coverage", "freshness"),
)
save_coverage_job = dg.define_asset_job(
    "save_coverage",
    selection=dg.AssetSelection.assets("embed_canonicals", "coverage"),
)
save_freshness_job = dg.define_asset_job(
    "save_freshness",
    selection=dg.AssetSelection.assets("freshness"),  # F3.2a: NO depende de embed_canonicals
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
    cron_schedule="0 */2 * * *",  # cada 2h — refresca precios de lo cubierto+viejo (F3.2a, SRD §3.1)
)

defs = dg.Definitions(
    assets=[embed_canonicals, *source_assets, coverage, freshness, price_drops, alert_matching],
    jobs=[save_catalog_job, save_coverage_job, save_freshness_job],
    schedules=[save_daily_refresh, save_coverage_daily, save_freshness_frequent],
)

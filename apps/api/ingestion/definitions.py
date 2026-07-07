"""`Definitions` de Dagster — punto de entrada del orquestador (`dagster dev -m ingestion.definitions`).

Un job que materializa todo el grafo de Save + una schedule diaria (interino: un solo ritmo; el
doble ritmo canasta/full-semanal de doc 06 §7 se suma cuando el catálogo crezca).
"""
from __future__ import annotations

import dagster as dg

from ingestion.save.assets import (
    alert_matching,
    embed_canonicals,
    price_drops,
    source_assets,
)

save_catalog_job = dg.define_asset_job("save_catalog_refresh", selection="*")

save_daily_refresh = dg.ScheduleDefinition(
    name="save_daily_refresh",
    job=save_catalog_job,
    cron_schedule="0 6 * * *",  # 06:00 diario (interino)
)

defs = dg.Definitions(
    assets=[embed_canonicals, *source_assets, price_drops, alert_matching],
    jobs=[save_catalog_job],
    schedules=[save_daily_refresh],
)

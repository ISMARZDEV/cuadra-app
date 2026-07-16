"""`Definitions` de Dagster — punto de entrada del orquestador (`dagster dev -m ingestion.definitions`).

La cadena diaria de Save (embed → descubrimiento → bajadas/alertas) se encadena por DEPENDENCIA, no
por reloj: `embed_canonicals` tiene el único cron (06:00) y lo demás lo arrastran las
`AutomationCondition` de cada asset, que evalúa el sensor `save_automation`.

Por qué así y no un job diario como antes: R1 particionó el descubrimiento por proveedor (el set de
tiendas sale de `store_registry`, no de un tuple en código), y Dagster no mezcla assets particionados
y no particionados en un mismo job. La cadena había que reconstruirla, y la alternativa —tres
schedules a horarios fijos— acoplaba el orden al reloj: si embed tardaba de más, el descubrimiento
corría igual sobre un índice viejo y nadie se enteraba.

Los jobs que quedan son para MANO: materializar/backfillear una partición puntual desde la UI.
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
    query_catalog_prices,
    query_catalog_providers,
    rest_catalog_prices,
    rest_catalog_sections,
    sync_query_catalog_providers,
    sync_rest_catalog_sections,
)

# Descubrimiento por-query, particionado por proveedor (R1). Job para disparar/backfillear UNA tienda
# a mano desde la UI; el ritmo normal lo da la cadena declarativa. El sensor mantiene las particiones
# al día desde store_registry.
save_query_catalog_job = dg.define_asset_job(
    "save_query_catalog",
    selection=dg.AssetSelection.assets("query_catalog_prices"),
    partitions_def=query_catalog_providers,
)
# Browse REST_CATALOG particionado por sección — se dispara por partición o backfill (UI). CONVIVE
# con el descubrimiento por-query: la canasta trae la versión Bravo de lo que se compara; el browse
# descubre los EXCLUSIVOS que la canasta nunca pediría (decisión 2026-07-16).
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

# Evalúa las AutomationCondition de la cadena diaria. Sin esto las condiciones son decoración: nadie
# las mira y la cadena no arranca nunca.
save_automation_sensor = dg.AutomationConditionSensorDefinition(
    name="save_automation",
    target=dg.AssetSelection.assets(
        "embed_canonicals", "query_catalog_prices", "price_drops", "alert_matching"
    ),
    default_status=dg.DefaultSensorStatus.RUNNING,
)

defs = dg.Definitions(
    assets=[
        embed_canonicals,
        query_catalog_prices,
        rest_catalog_prices,
        coverage,
        freshness,
        price_refresh,
        price_drops,
        alert_matching,
    ],
    jobs=[
        save_query_catalog_job, save_rest_catalog_job, save_coverage_job,
        save_freshness_job, save_price_refresh_job,
    ],
    schedules=[
        save_coverage_daily, save_freshness_frequent, save_price_refresh_frequent,
    ],
    sensors=[
        sync_rest_catalog_sections, sync_query_catalog_providers, save_automation_sensor,
    ],
)

"""Assets de Dagster para el catálogo de Save (asset-centric → lineage por fuente, doc 06 §3).

Un asset por fuente (`sirena_prices`/`nacional_prices`/`jumbo_prices`) que corre el refresh
change-only sobre la canasta curada, y un asset `price_drops` aguas abajo (deps de las tres)
que corre la detección G4. Los assets son PIEL fina sobre lógica ya testeada (`build_sources`,
`refresh_source`, `ListPriceDrops`); su forma de grafo se valida en tests/ingestion, la
materialización real es manual (`dagster dev`). La sesión se abre/commitea por materialización.
"""
from __future__ import annotations

import dagster as dg

from src.contexts.save.application.alerts import RunAlertMatching
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.infrastructure.expo_push_sender import ExpoPushSender
from src.contexts.save.infrastructure.repositories import (
    SqlAlertRepository,
    SqlStoreProductRepository,
)
from src.shared.db.base import SessionLocal

from src.contexts.save.infrastructure.catalog_sources.pacing import build_pace

from .composition import (
    build_basket_queries,
    build_canonical_embedder,
    build_category_embedder,
    build_classifier,
    build_cover_canonicals,
    build_matcher,
    build_refresh_covered_prices,
    build_refresh_known_prices,
    build_rest_catalog_source_for,
    parse_rest_catalog_partition_key,
    rest_catalog_partition_keys,
)
from .runner import refresh_source
from .sources import SAVE_MARKET, build_sources

SOURCE_KEYS: tuple[str, ...] = ("sirena", "nacional", "jumbo")
_DROPS_WINDOW_DAYS = 7

# Particiones DINÁMICAS del browse REST_CATALOG — una por (provider, section). Dinámicas porque las
# secciones son config de admin (store_registry), no un set fijo en código; el sensor las sincroniza.
rest_catalog_sections = dg.DynamicPartitionsDefinition(name="rest_catalog_section")


@dg.asset(
    name="embed_canonicals",
    group_name="save_catalog",
    description="Backfill del índice semántico: embebe los canónicos antes del matching (no-op si dark).",
)
def embed_canonicals(context) -> dg.MaterializeResult:
    """Upstream de las fuentes: la etapa vectorial de la cascada necesita canónicos ya embebidos.
    No-op cuando `SAVE_MATCHING_CASCADE_ENABLED=false` (`build_canonical_embedder` → None)."""
    with SessionLocal() as session:
        embedder = build_canonical_embedder(session)
        embedded = embedder.execute(SAVE_MARKET) if embedder is not None else 0
        # Índice semántico de CATEGORÍAS (no-op si la clasificación está dark).
        cat_embedder = build_category_embedder(session)
        cat_embedded = cat_embedder.execute(SAVE_MARKET) if cat_embedder is not None else 0
        session.commit()
    context.log.info(f"embed_canonicals: {embedded} canónicos + {cat_embedded} categorías embebidos")
    return dg.MaterializeResult(metadata={"embedded": embedded, "categories": cat_embedded})


def _build_source_asset(source_key: str) -> dg.AssetsDefinition:
    @dg.asset(
        name=f"{source_key}_prices",
        deps=[dg.AssetKey("embed_canonicals")],  # matching necesita el índice semántico poblado
        group_name="save_catalog",
        description=f"Refresh de precios vivos (change-only) — {source_key}",
    )
    def _asset(context) -> dg.MaterializeResult:
        with SessionLocal() as session:
            # F1 (Gap #1): la canasta sale de la TABLA `basket_query` (active) del mercado, no del
            # tuple hardcodeado. La sesión se abre antes para leerla y reusarla en el refresh.
            queries = build_basket_queries(session, SAVE_MARKET)
            if not queries:
                context.log.warning(
                    f"{source_key}: canasta VACÍA para {SAVE_MARKET} (basket_query sin filas active) "
                    f"— no hay nada que ingerir. Poblá la canasta (migración/admin)."
                )
            context.log.info(
                f"{source_key}: arrancando refresh sobre {len(queries)} queries de la canasta "
                f"(cascada/clasificación según flags)"
            )
            adapters = build_sources(queries=queries)[source_key]
            result = refresh_source(
                SqlStoreProductRepository(session), adapters,
                matcher=build_matcher(session), classifier=build_classifier(session),
                on_progress=lambda i, n, r: context.log.info(
                    f"[{source_key}] query {i}/{n} · acumulado: "
                    f"seen={r.seen} matched={r.matched} unmatched={r.unmatched}"
                ),
                # Un adapter POR TÉRMINO de canasta contra la MISMA tienda (hoy 213) → sin pausa es
                # un martilleo. El browse REST (abajo) no la necesita acá: trae la suya del factory.
                pace=build_pace(),
            )
            session.commit()
        context.log.info(
            f"{source_key}: LISTO seen={result.seen} refreshed={result.refreshed} "
            f"unmatched={result.unmatched} matched={result.matched}"
        )
        return dg.MaterializeResult(
            metadata={
                "seen": result.seen,
                "refreshed": result.refreshed,
                "unmatched": result.unmatched,
                "matched": result.matched,
            }
        )

    return _asset


source_assets: list[dg.AssetsDefinition] = [_build_source_asset(k) for k in SOURCE_KEYS]


@dg.asset(
    name="rest_catalog_prices",
    partitions_def=rest_catalog_sections,  # UNA sección REST_CATALOG por partición ({provider}:{section})
    deps=[dg.AssetKey("embed_canonicals")],  # el matching del refresh necesita el índice semántico
    group_name="save_catalog",
    description="Refresh (browse-full) de UNA sección REST_CATALOG por partición ({provider}:{section}), "
    "registry-driven (Bravo y afines). Particionado → cada sección se materializa/reintenta por separado.",
)
def rest_catalog_prices(context) -> dg.MaterializeResult:
    """Loop A por sección para súper con API REST propia: a diferencia de sirena/nacional/jumbo
    (query-based sobre la canasta), estas se navegan COMPLETAS por sección. La partición es
    `{provider_id}:{section}`; el sensor `sync_rest_catalog_sections` mantiene el set al día desde
    `store_registry`. Una sección que ya no existe (partición huérfana) se salta sin fallar."""
    provider_id, section = parse_rest_catalog_partition_key(context.partition_key)
    with SessionLocal() as session:
        source = build_rest_catalog_source_for(session, provider_id, section)
        if source is None:
            context.log.warning(
                f"rest_catalog_prices[{context.partition_key}]: fuente REST_CATALOG inexistente "
                "(partición huérfana) — se salta."
            )
            return dg.MaterializeResult(metadata={"seen": 0, "skipped": True})
        result = refresh_source(
            SqlStoreProductRepository(session), [source],
            matcher=build_matcher(session), classifier=build_classifier(session),
        )
        session.commit()
    context.log.info(
        f"rest_catalog_prices[{context.partition_key}]: LISTO seen={result.seen} "
        f"refreshed={result.refreshed} unmatched={result.unmatched} matched={result.matched}"
    )
    return dg.MaterializeResult(
        metadata={
            "seen": result.seen,
            "refreshed": result.refreshed,
            "unmatched": result.unmatched,
            "matched": result.matched,
        }
    )


@dg.sensor(
    name="sync_rest_catalog_sections",
    minimum_interval_seconds=300,
    default_status=dg.DefaultSensorStatus.RUNNING,
    description="Sincroniza las particiones dinámicas de rest_catalog_prices con las secciones "
    "configuradas en store_registry (agrega las nuevas, quita las que dejaron de existir).",
)
def sync_rest_catalog_sections(context) -> dg.SensorResult | dg.SkipReason:
    with SessionLocal() as session:
        desired = set(rest_catalog_partition_keys(session))
    current = set(context.instance.get_dynamic_partitions(rest_catalog_sections.name))
    to_add = sorted(desired - current)
    to_remove = sorted(current - desired)
    if not to_add and not to_remove:
        return dg.SkipReason("particiones REST_CATALOG ya sincronizadas con store_registry")
    requests = []
    if to_add:
        requests.append(rest_catalog_sections.build_add_request(to_add))
    if to_remove:
        requests.append(rest_catalog_sections.build_delete_request(to_remove))
    context.log.info(f"particiones REST_CATALOG: +{len(to_add)} / -{len(to_remove)}")
    return dg.SensorResult(dynamic_partitions_requests=requests)


@dg.asset(
    name="coverage",
    deps=[dg.AssetKey("embed_canonicals")],  # la cascada valida los candidatos → índice semántico
    group_name="save_catalog",
    description="Loop B (cobertura dirigida, F3.1): busca cada canónico NO cubierto en cada tienda "
    "(consulta EAN-first) y lo enlaza vía la cascada; nunca crea canónicos.",
)
def coverage(context) -> dg.MaterializeResult:
    with SessionLocal() as session:
        result = build_cover_canonicals(session).execute(SAVE_MARKET)
        session.commit()
    context.log.info(
        f"coverage: pares={result.pairs_attempted} seen={result.seen} matched={result.matched}"
    )
    return dg.MaterializeResult(
        metadata={
            "pairs_attempted": result.pairs_attempted,
            "seen": result.seen,
            "matched": result.matched,
            "stores_aborted": result.stores_aborted,
        }
    )


@dg.asset(
    name="freshness",
    group_name="save_catalog",
    description="F3.2a (frescura): re-fetch DIRECTO por id/url de lo cubierto+VIEJO (staleness 18h/3d) "
    "→ record_observation change-only. NO re-descubre (el enlace ya se conoce) → sin dep de "
    "embed_canonicals. Su schedule es FRECUENTE (equivalente al Prices Batch de SRD §3.1).",
)
def freshness(context) -> dg.MaterializeResult:
    with SessionLocal() as session:
        result = build_refresh_covered_prices(session).execute(SAVE_MARKET)
        session.commit()
    context.log.info(
        f"freshness: checked={result.checked} refreshed={result.refreshed} "
        f"unavailable={result.unavailable} stores_aborted={result.stores_aborted}"
    )
    return dg.MaterializeResult(
        metadata={
            "checked": result.checked,
            "refreshed": result.refreshed,
            "unavailable": result.unavailable,
            "stores_aborted": result.stores_aborted,
        }
    )


@dg.asset(
    name="price_refresh",
    group_name="save_catalog",
    description="Prices Batch (paridad SRD §3.1): re-precia por id/get TODO lo CONOCIDO y viejo "
    "(matcheado O en revisión) → record_observation change-only, SIN matcher ni descubrimiento. "
    "Superset de `freshness` (covered-only): mantiene fresco el precio de la cola de revisión sin "
    "re-browsear. Sin dep de embed_canonicals (no re-descubre).",
)
def price_refresh(context) -> dg.MaterializeResult:
    with SessionLocal() as session:
        result = build_refresh_known_prices(session).execute(SAVE_MARKET)
        session.commit()
    context.log.info(
        f"price_refresh: checked={result.checked} refreshed={result.refreshed} "
        f"unavailable={result.unavailable} stores_aborted={result.stores_aborted}"
    )
    return dg.MaterializeResult(
        metadata={
            "checked": result.checked,
            "refreshed": result.refreshed,
            "unavailable": result.unavailable,
            "stores_aborted": result.stores_aborted,
        }
    )


@dg.asset(
    deps=[*(dg.AssetKey(f"{k}_prices") for k in SOURCE_KEYS), dg.AssetKey("rest_catalog_prices")],
    group_name="save_catalog",
    description="Bajadas de precio detectadas tras el refresh (G4).",
)
def price_drops(context) -> dg.MaterializeResult:
    with SessionLocal() as session:
        drops = ListPriceDrops(SqlStoreProductRepository(session)).execute(
            SAVE_MARKET, days=_DROPS_WINDOW_DAYS
        )
    context.log.info(f"{len(drops)} bajadas detectadas ({_DROPS_WINDOW_DAYS}d)")
    return dg.MaterializeResult(metadata={"drops": len(drops)})


@dg.asset(
    deps=[*(dg.AssetKey(f"{k}_prices") for k in SOURCE_KEYS), dg.AssetKey("rest_catalog_prices")],
    group_name="save_catalog",
    description="Cruce de bajadas con las suscripciones → notificaciones de alerta (G4).",
)
def alert_matching(context) -> dg.MaterializeResult:
    """Vía de PROD del matching de alertas (antes: endpoint dev-guarded). Cuelga de las fuentes —
    tras el refresh cruza las bajadas con las suscripciones activas y persiste las notificaciones
    (idempotente); el push es best-effort (`ExpoPushSender`), nunca rompe el matching. Escribe →
    commitea la sesión. `RunAlertMatching` ya está testeado; el asset es piel fina."""
    with SessionLocal() as session:
        created = RunAlertMatching(
            SqlStoreProductRepository(session),
            SqlAlertRepository(session),
            ExpoPushSender(),
        ).execute(SAVE_MARKET, days=_DROPS_WINDOW_DAYS)
        session.commit()
    context.log.info(f"{created} notificaciones de alerta creadas")
    return dg.MaterializeResult(metadata={"notifications": created})

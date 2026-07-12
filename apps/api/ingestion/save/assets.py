"""Assets de Dagster para el catálogo de Save (asset-centric → lineage por fuente, doc 06 §3).

Un asset por fuente (`sirena_prices`/`nacional_prices`/`jumbo_prices`) que corre el refresh
change-only sobre la canasta curada, y un asset `price_drops` aguas abajo (deps de las tres)
que corre la detección G4. Los assets son PIEL fina sobre lógica ya testeada (`build_sources`,
`refresh_source`, `ListPriceDrops`); su forma de grafo se valida en tests/ingestion, la
materialización real es manual (`dagster dev`). La sesión se abre/commitea por materialización.
"""
from __future__ import annotations

import os
from collections.abc import Sequence

import dagster as dg

from src.contexts.save.application.alerts import RunAlertMatching
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.infrastructure.expo_push_sender import ExpoPushSender
from src.contexts.save.infrastructure.repositories import (
    SqlAlertRepository,
    SqlBasketQueryRepository,
    SqlStoreProductRepository,
)
from src.shared.db.base import SessionLocal

from .composition import (
    build_canonical_embedder,
    build_category_embedder,
    build_classifier,
    build_matcher,
)
from .runner import refresh_source
from .sources import SAVE_MARKET, build_sources

SOURCE_KEYS: tuple[str, ...] = ("sirena", "nacional", "jumbo")
_DROPS_WINDOW_DAYS = 7


def _select_queries(db_queries: Sequence[str], limit_env: str | None) -> tuple[str, ...]:
    """PURO: la canasta que ingiere = las queries de la TABLA `basket_query` (active, ya resueltas
    por el repo). La tabla es la ÚNICA fuente de verdad — ya NO hay fallback hardcodeado (el backfill
    vive en migración y la tabla se protege de los resets). `SAVE_REFRESH_QUERY_LIMIT` recorta a las
    primeras N (runs cortos en dev)."""
    queries = tuple(db_queries)
    if limit_env and limit_env.isdigit() and int(limit_env) > 0:
        return queries[: int(limit_env)]
    return queries


def _refresh_queries(session, market: str) -> tuple[str, ...]:  # type: ignore[no-untyped-def]
    """Canasta que consume la INGESTA (F1, Gap #1): lee `basket_query WHERE active=true` del MERCADO
    (multi-país — cada mercado ingiere SU canasta, nunca market-blind)."""
    active = SqlBasketQueryRepository(session).list_active(market)
    return _select_queries([q.query_text for q in active], os.getenv("SAVE_REFRESH_QUERY_LIMIT"))


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
            queries = _refresh_queries(session, SAVE_MARKET)
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
    deps=[dg.AssetKey(f"{k}_prices") for k in SOURCE_KEYS],
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
    deps=[dg.AssetKey(f"{k}_prices") for k in SOURCE_KEYS],
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

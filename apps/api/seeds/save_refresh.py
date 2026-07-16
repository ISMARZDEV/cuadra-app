"""Refresh manual de precios vivos de Save: `python -m seeds.save_refresh` (o `make save-refresh`).

CLI ligero (SIN dagster) para disparar el refresh a mano. Comparte el MISMO wiring que los assets
de Dagster (`ingestion.save`) — una sola fuente de verdad. Refresca SOLO productos ya matcheados
(change-only); lo desconocido lo resolverá el matching (F2). El orquestador con scheduling/lineage
es `ingestion.definitions` (`make ingestion-dev`); esto es el atajo sin proceso Dagster.
"""
from __future__ import annotations

from ingestion.save.composition import (
    build_basket_queries,
    build_canonical_embedder,
    build_category_embedder,
    build_classifier,
    build_matcher,
    build_query_catalog_sources_for,
    query_catalog_partition_keys,
)
from ingestion.save.runner import refresh_source
from src.contexts.save.infrastructure.catalog_sources.pacing import build_pace
from ingestion.save.sources import SAVE_MARKET
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreProductRepository,
)


def main() -> None:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        repo = SqlStoreProductRepository(session)
        # Backfill del índice semántico ANTES del matching (no-op si la cascada está dark).
        embedder = build_canonical_embedder(session)
        if embedder is not None:
            embedded = embedder.execute(SAVE_MARKET)
            print(f"save-refresh embeddings: {embedded} canónicos embebidos (índice semántico)")
        # Backfill de embeddings de CATEGORÍA antes de clasificar (no-op si la clasificación está dark).
        cat_embedder = build_category_embedder(session)
        if cat_embedder is not None:
            cat_embedded = cat_embedder.execute(SAVE_MARKET)
            print(f"save-refresh embeddings: {cat_embedded} categorías embebidas (índice semántico)")
        matcher = build_matcher(session)  # None salvo SAVE_MATCHING_CASCADE_ENABLED=true
        classifier = build_classifier(session)  # None salvo SAVE_CLASSIFICATION_ENABLED=true
        # La canasta sale de la TABLA, igual que en los assets de Dagster. Hasta 2026-07-16 esto
        # era `build_sources()` a secas y se llevaba un tuple hardcodeado de 213 términos: el CLI
        # ingería una canasta DISTINTA de la que el admin había configurado, y ninguno avisaba.
        queries = build_basket_queries(session, SAVE_MARKET)
        if not queries:
            print(
                f"save-refresh: canasta VACÍA para {SAVE_MARKET} (basket_query sin filas active) "
                "— no hay nada que ingerir. Poblá la canasta (migración/admin)."
            )
            return
        # Las TIENDAS salen del registry (R1), igual que en los assets de Dagster: activas ×
        # capacidad by_text. Antes eran el tuple hardcodeado sirena/nacional/jumbo, así que este CLI
        # no veía a Bravo ni respetaba una tienda pausada desde el admin.
        provider_ids = query_catalog_partition_keys(session)
        if not provider_ids:
            print(
                f"save-refresh: NINGUNA fuente activa que busque por texto en {SAVE_MARKET} "
                "(store_registry vacío, todo apagado/pausado, o sin capacidad by_text)."
            )
            return
        provider_repo = SqlProviderRepository(session)
        print(
            f"save-refresh: {len(queries)} queries activas de la canasta × "
            f"{len(provider_ids)} tiendas activas"
        )
        for provider_id in provider_ids:
            adapters = build_query_catalog_sources_for(session, provider_id, queries)
            if adapters is None:
                continue
            provider = provider_repo.get_by_id(provider_id)
            name = provider.name if provider else provider_id
            result = refresh_source(
                repo, adapters, matcher=matcher, classifier=classifier, pace=build_pace()
            )
            print(
                f"save-refresh {name}: seen={result.seen} "
                f"refreshed={result.refreshed} unmatched={result.unmatched} "
                f"matched={result.matched}"
            )
        session.commit()
    print("save-refresh: OK (change-only; desconocidos → cascada F2 si el flag está activo).")


if __name__ == "__main__":
    main()

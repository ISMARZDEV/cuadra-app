"""Refresh manual de precios vivos de Save: `python -m seeds.save_refresh` (o `make save-refresh`).

CLI ligero (SIN dagster) para disparar el refresh a mano. Comparte el MISMO wiring que los assets
de Dagster (`ingestion.save`) — una sola fuente de verdad. Refresca SOLO productos ya matcheados
(change-only); lo desconocido lo resolverá el matching (F2). El orquestador con scheduling/lineage
es `ingestion.definitions` (`make ingestion-dev`); esto es el atajo sin proceso Dagster.
"""
from __future__ import annotations

from ingestion.save.composition import (
    build_canonical_embedder,
    build_category_embedder,
    build_classifier,
    build_matcher,
)
from ingestion.save.runner import refresh_source
from ingestion.save.sources import SAVE_MARKET, build_sources
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository


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
        for name, adapters in build_sources().items():
            result = refresh_source(repo, adapters, matcher=matcher, classifier=classifier)
            print(
                f"save-refresh {name}: seen={result.seen} "
                f"refreshed={result.refreshed} unmatched={result.unmatched} "
                f"matched={result.matched}"
            )
        session.commit()
    print("save-refresh: OK (change-only; desconocidos → cascada F2 si el flag está activo).")


if __name__ == "__main__":
    main()

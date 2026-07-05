"""Refresh manual de precios vivos de Save: `python -m seeds.save_refresh` (o `make save-refresh`).

CLI ligero (SIN dagster) para disparar el refresh a mano. Comparte el MISMO wiring que los assets
de Dagster (`ingestion.save`) — una sola fuente de verdad. Refresca SOLO productos ya matcheados
(change-only); lo desconocido lo resolverá el matching (F2). El orquestador con scheduling/lineage
es `ingestion.definitions` (`make ingestion-dev`); esto es el atajo sin proceso Dagster.
"""
from __future__ import annotations

from ingestion.save.composition import build_matcher
from ingestion.save.runner import refresh_source
from ingestion.save.sources import build_sources
from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository


def main() -> None:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        repo = SqlStoreProductRepository(session)
        matcher = build_matcher(session)  # None salvo SAVE_MATCHING_CASCADE_ENABLED=true
        for name, adapters in build_sources().items():
            result = refresh_source(repo, adapters, matcher=matcher)
            print(
                f"save-refresh {name}: seen={result.seen} "
                f"refreshed={result.refreshed} unmatched={result.unmatched} "
                f"matched={result.matched}"
            )
        session.commit()
    print("save-refresh: OK (change-only; desconocidos → cascada F2 si el flag está activo).")


if __name__ == "__main__":
    main()

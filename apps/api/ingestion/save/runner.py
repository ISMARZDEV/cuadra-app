"""Runner de refresh — agrega `RefreshCatalogPrices` sobre los adapters de una fuente.

Sin dagster ni red propia: la lógica de refresh (change-only, solo matcheados) vive en
`RefreshCatalogPrices`; acá solo se corre por cada adapter de la fuente (una canasta puede
tener varias queries) y se suman los conteos. Lo usan tanto los assets de Dagster como el
CLI `make save-refresh`.
"""
from __future__ import annotations

from datetime import datetime

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices, RefreshResult
from src.contexts.save.domain.ports import CatalogSource, StoreProductRepository


def refresh_source(
    store_repo: StoreProductRepository,
    adapters: list[CatalogSource],
    captured_at: datetime | None = None,
) -> RefreshResult:
    """Corre el refresh sobre cada adapter de la fuente y agrega los conteos."""
    use_case = RefreshCatalogPrices(store_repo)
    seen = refreshed = unmatched = 0
    for adapter in adapters:
        result = use_case.execute(adapter, captured_at=captured_at)
        seen += result.seen
        refreshed += result.refreshed
        unmatched += result.unmatched
    return RefreshResult(seen=seen, refreshed=refreshed, unmatched=unmatched)

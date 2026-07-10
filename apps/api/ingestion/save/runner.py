"""Runner de refresh — agrega `RefreshCatalogPrices` sobre los adapters de una fuente.

Sin dagster ni red propia: la lógica de refresh (change-only, solo matcheados; y —si la cascada
F2.0 está activa— el enrutamiento de los desconocidos al matcher) vive en `RefreshCatalogPrices`;
acá solo se corre por cada adapter de la fuente (una canasta puede tener varias queries) y se
suman los conteos. Lo usan tanto los assets de Dagster como el CLI `make save-refresh`.
"""
from __future__ import annotations

from datetime import datetime

from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.application.refresh_prices import RefreshCatalogPrices, RefreshResult
from src.contexts.save.domain.ports import CatalogSource, StoreProductRepository


def refresh_source(
    store_repo: StoreProductRepository,
    adapters: list[CatalogSource],
    captured_at: datetime | None = None,
    matcher: MatchStoreProduct | None = None,
    classifier: ClassifyStoreProduct | None = None,
) -> RefreshResult:
    """Corre el refresh sobre cada adapter de la fuente y agrega los conteos.

    `matcher` opcional (cascada F2.0): cuando se pasa, los store_products desconocidos se enrutan
    al matching en vez de descartarse. `None` = comportamiento legacy F1.
    `classifier` opcional (save-category-classification): clasifica inline la categoría de cada
    store_product materializado (idempotente). `None` = clasificación dark.
    """
    use_case = RefreshCatalogPrices(store_repo, matcher=matcher, classifier=classifier)
    seen = refreshed = unmatched = matched = 0
    for adapter in adapters:
        result = use_case.execute(adapter, captured_at=captured_at)
        seen += result.seen
        refreshed += result.refreshed
        unmatched += result.unmatched
        matched += result.matched
    return RefreshResult(seen=seen, refreshed=refreshed, unmatched=unmatched, matched=matched)

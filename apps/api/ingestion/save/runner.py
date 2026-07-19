"""Runner de refresh — agrega `RefreshCatalogPrices` sobre los adapters de una fuente.

Sin dagster ni red propia: la lógica de refresh (change-only, solo matcheados; y —si la cascada
F2.0 está activa— el enrutamiento de los desconocidos al matcher) vive en `RefreshCatalogPrices`;
acá solo se corre por cada adapter de la fuente (una canasta puede tener varias queries) y se
suman los conteos. Lo usan tanto los assets de Dagster como el CLI `make save-refresh`.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.application.refresh_prices import (
    RefreshCatalogPrices,
    RefreshResult,
    RelevanceGate,
)
from src.contexts.save.domain.ports import CatalogSource, StoreProductRepository


def refresh_source(
    store_repo: StoreProductRepository,
    adapters: list[CatalogSource],
    captured_at: datetime | None = None,
    matcher: MatchStoreProduct | None = None,
    classifier: ClassifyStoreProduct | None = None,
    on_progress: Callable[[int, int, RefreshResult], None] | None = None,
    pace: Callable[[], None] | None = None,
    relevance_gate: RelevanceGate | None = None,
    run_id: str | None = None,
) -> RefreshResult:
    """Corre el refresh sobre cada adapter de la fuente y agrega los conteos.

    `matcher` opcional (cascada F2.0): cuando se pasa, los store_products desconocidos se enrutan
    al matching en vez de descartarse. `None` = comportamiento legacy F1.
    `classifier` opcional (save-category-classification): clasifica inline la categoría de cada
    store_product materializado (idempotente). `None` = clasificación dark.
    `on_progress` opcional: callback `(indice, total, acumulado)` tras CADA adapter/query —
    observabilidad de progreso (p.ej. `context.log` de Dagster). `None` = silencioso (default).
    `pace` opcional: espera ENTRE adapters. CADA adapter es una búsqueda contra la MISMA tienda
    (`composition.py` arma uno por término ACTIVO de la canasta), así que sin pausa esto es un
    martilleo — el mismo bug que en price_refresh/Loop B/browse. Acá el round-robin ni participa.
    `None` = sin espera (tests); prod wirea `build_pace()`.
    """
    use_case = RefreshCatalogPrices(
        store_repo, matcher=matcher, classifier=classifier, relevance_gate=relevance_gate
    )
    seen = refreshed = unmatched = matched = discarded = 0
    auto_linked = queued_for_review = 0
    total = len(adapters)
    for index, adapter in enumerate(adapters, start=1):
        if index > 1 and pace is not None:
            pace()  # ENTRE búsquedas, nunca antes de la primera (SRD `scrape-many.ts`)
        result = use_case.execute(adapter, captured_at=captured_at, run_id=run_id)
        seen += result.seen
        refreshed += result.refreshed
        unmatched += result.unmatched
        matched += result.matched
        discarded += result.discarded
        auto_linked += result.auto_linked
        queued_for_review += result.queued_for_review
        if on_progress is not None:
            on_progress(
                index,
                total,
                RefreshResult(
                    seen=seen, refreshed=refreshed, unmatched=unmatched,
                    matched=matched, discarded=discarded,
                    auto_linked=auto_linked, queued_for_review=queued_for_review,
                ),
            )
    return RefreshResult(
        seen=seen, refreshed=refreshed, unmatched=unmatched, matched=matched, discarded=discarded,
        auto_linked=auto_linked, queued_for_review=queued_for_review,
    )

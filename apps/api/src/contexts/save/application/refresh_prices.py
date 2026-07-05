"""Use case RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados.

Recorre una `CatalogSource` (adapter por plataforma) y registra la observación SOLO para
store_products conocidos por (provider, external_id) — el alta/matching de productos nuevos
es del pipeline de F2. Pasa canonical_product_id=None: en refresh `record_observation` no
toca el link canónico (solo lo usa al crear). El SCD-4 change-only vive en el repo.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from ..domain.ports import CatalogSource, StoreProductRepository


@dataclass(frozen=True, slots=True)
class RefreshResult:
    seen: int        # entradas devueltas por la fuente
    refreshed: int   # conocidas → observación registrada
    unmatched: int   # desconocidas → las resolverá el matching (F2)


class RefreshCatalogPrices:
    def __init__(self, store_repo: StoreProductRepository) -> None:
        self._store_repo = store_repo

    def execute(self, source: CatalogSource, captured_at: datetime | None = None) -> RefreshResult:
        ts = captured_at or datetime.now(timezone.utc)
        seen = refreshed = unmatched = 0
        for entry in source.fetch():
            seen += 1
            if not self._store_repo.exists(entry.provider_id, entry.external_id):
                unmatched += 1
                continue
            self._store_repo.record_observation(
                provider_id=entry.provider_id,
                external_id=entry.external_id,
                canonical_product_id=None,
                price=entry.price,
                captured_at=ts,
                price_type=entry.price_type,
                source=entry.source,
                url=entry.url,
                ean=entry.ean,
            )
            refreshed += 1
        return RefreshResult(seen=seen, refreshed=refreshed, unmatched=unmatched)

"""Use case RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados y —cuando
la cascada F2.0 está activa— ENRUTA los productos nuevos (desconocidos) al matching.

Recorre una `CatalogSource` (adapter por plataforma). Para un store_product ya conocido por
(provider, external_id) registra la observación (SCD-4 change-only). Para uno DESCONOCIDO:

- sin `matcher` (flag off, comportamiento legacy F1): lo cuenta como `unmatched` y lo descarta.
- con `matcher` (cascada F2.0 activa, `SAVE_MATCHING_CASCADE_ENABLED=true`): materializa el
  store_product (record_observation con canonical=None) para obtener su id y lo pasa a
  `MatchStoreProduct.execute` — la cascada decide el enlace (o lo manda a revisión). Se cuenta
  como `matched`.

El SCD-4 change-only y la escritura del FK canónico viven en la infra/cascada, no aquí.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from ..domain.ports import CatalogSource, StoreProductRepository
from .match_store_product import IncomingStoreProduct, MatchStoreProduct


@dataclass(frozen=True, slots=True)
class RefreshResult:
    seen: int        # entradas devueltas por la fuente
    refreshed: int   # conocidas → observación registrada
    unmatched: int   # desconocidas SIN matcher → descartadas (legacy F1)
    matched: int = 0  # desconocidas enrutadas a la cascada F2.0 (matcher activo)


class RefreshCatalogPrices:
    def __init__(
        self,
        store_repo: StoreProductRepository,
        matcher: MatchStoreProduct | None = None,
    ) -> None:
        self._store_repo = store_repo
        self._matcher = matcher

    def execute(self, source: CatalogSource, captured_at: datetime | None = None) -> RefreshResult:
        ts = captured_at or datetime.now(timezone.utc)
        seen = refreshed = unmatched = matched = 0
        for entry in source.fetch():
            seen += 1
            if not self._store_repo.exists(entry.provider_id, entry.external_id):
                if self._matcher is None:
                    unmatched += 1  # legacy F1: se descarta, el matching es de F2
                    continue
                # Cascada F2.0 activa: materializa el store_product y enrútalo al matcher.
                store_product_id = self._store_repo.record_observation(
                    provider_id=entry.provider_id,
                    external_id=entry.external_id,
                    canonical_product_id=None,
                    price=entry.price,
                    captured_at=ts,
                    price_type=entry.price_type,
                    source=entry.source,
                    url=entry.url,
                    ean=entry.ean,
                    name=entry.name,
                    brand=entry.brand,
                    size_text=entry.size_text,
                    image_url=entry.image_url,
                )
                self._matcher.execute(
                    IncomingStoreProduct(
                        store_product_id=store_product_id,
                        market_id=entry.market_id,
                        name=entry.name,
                        brand=entry.brand,
                        size=entry.size_text,
                        ean=entry.ean,
                    )
                )
                matched += 1
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
                name=entry.name,
                brand=entry.brand,
                size_text=entry.size_text,
                image_url=entry.image_url,
            )
            refreshed += 1
        return RefreshResult(seen=seen, refreshed=refreshed, unmatched=unmatched, matched=matched)

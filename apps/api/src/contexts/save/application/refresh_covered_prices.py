"""`RefreshCoveredPrices` — F3.2a / frescura: mantiene frescos los precios de lo YA cubierto.

Recorre los `store_product` cubiertos y VIEJOS (`list_stale_covered`, TTL 18h visibles / 3d ocultos,
patrón SRD §3.1) y por cada uno hace un re-fetch DIRECTO por su `external_id`/`url` conocido (camino A:
`ProductDetailSource`, 1 request = 1 producto) → lo enruta al MISMO pipeline de refresh
(`RefreshCatalogPrices` → `record_observation`, change-only: precio igual solo bumpea `last_seen_at`,
distinto agrega fila de histórico). Como el `store_product` YA existe, la cascada de matching NO corre
(se refresca el enlace conocido, no se re-descubre).

Fase 1 (F3.2a): si A no encuentra el producto (id/url muerto) → `is_available=false` directo. La
recuperación por búsqueda dirigida (B) llega en F3.2b. Reusa F3.3: round-robin por tienda + abort-on-down
+ result tipado. Salta plataformas browse-only (no soportan fetch-by-id → las refresca el browse de Loop A).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from ..domain.coverage import StaleCovered, round_robin_by_store
from ..domain.directed_query import supports_directed_query
from ..domain.fetch_outcome import FetchErrorKind, FetchOutcome
from ..domain.ports import ProductDetailSource, RawCatalogEntry, StoreProductRepository
from .refresh_prices import RefreshCatalogPrices

# Puertos inyectables (mismo patrón que CoverCanonicals): construir el detail source por item, y
# clasificar el error de fetch (retryable/hide) sin acoplar la aplicación a httpx.
BuildDetailSource = Callable[[StaleCovered], ProductDetailSource]
ClassifyFetchError = Callable[[Exception], FetchOutcome]


def _reraise_classifier(exc: Exception) -> FetchOutcome:
    return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)


@dataclass(frozen=True, slots=True)
class FreshnessResult:
    checked: int          # store_products viejos que se intentaron (tras el gate browse-only)
    refreshed: int        # re-fetch OK → change-only (precio igual o nuevo)
    unavailable: int      # A no lo encontró → is_available=false (fase 1, sin B)
    stores_aborted: int = 0  # tiendas caídas (503/timeout) cuyos items restantes se saltaron


@dataclass(frozen=True, slots=True)
class _SingleEntrySource:
    """`CatalogSource` en-memoria con el producto re-fetcheado → lo consume `RefreshCatalogPrices`
    (que por el exists-check lo trata como refresh change-only, sin matching)."""

    entries: tuple[RawCatalogEntry, ...]

    def fetch(self) -> tuple[RawCatalogEntry, ...]:
        return self.entries


class RefreshCoveredPrices:
    def __init__(
        self,
        *,
        store_repo: StoreProductRepository,
        refresh: RefreshCatalogPrices,
        build_detail_source: BuildDetailSource,
        classify_error: ClassifyFetchError = _reraise_classifier,
    ) -> None:
        self._store_repo = store_repo
        self._refresh = refresh
        self._build_detail_source = build_detail_source
        self._classify_error = classify_error

    def execute(
        self, market_id: str, *, now: datetime | None = None, captured_at: datetime | None = None
    ) -> FreshnessResult:
        checked = refreshed = unavailable = 0
        items = round_robin_by_store(self._store_repo.list_stale_covered(market_id, now))
        down: set[str] = set()
        for item in items:
            if item.provider_id in down:
                continue  # abort-on-down: la tienda ya cayó esta corrida
            if not supports_directed_query(item.platform):
                continue  # browse-only → sin fetch-by-id; lo refresca el browse de Loop A
            source = self._build_detail_source(item)
            checked += 1
            try:
                entry = source.fetch_by_external_id(item.external_id, item.url)  # camino A
            except Exception as exc:  # noqa: BLE001 — se clasifica; los no-transitorios se re-lanzan
                outcome = self._classify_error(exc)
                if outcome.retryable:
                    down.add(item.provider_id)
                    continue
                raise
            if entry is None:
                # Fase 1: A no lo encontró → oculta (no borra, F3.0). F3.2b intentará B antes de rendirse.
                self._store_repo.set_availability(item.store_product_id, False)
                unavailable += 1
            else:
                self._refresh.execute(_SingleEntrySource((entry,)), captured_at=captured_at)
                refreshed += 1
        return FreshnessResult(
            checked=checked, refreshed=refreshed, unavailable=unavailable, stores_aborted=len(down)
        )

"""`RefreshCoveredPrices` — F3.2a / frescura: mantiene frescos los precios de lo YA cubierto.

Recorre los `store_product` cubiertos y VIEJOS (`list_stale_covered`, TTL 18h visibles / 3d ocultos,
patrón SRD §3.1). Camino A: re-fetch DIRECTO por su localizador (`external_id`/`url`, o `source_ref`
para Bravo) → `RefreshCatalogPrices` → `record_observation` (change-only: precio igual solo bumpea
`last_seen_at`, distinto agrega fila de histórico). Como el `store_product` YA existe, la cascada de
matching NO corre (se refresca el enlace conocido, no se re-descubre).

Fallback A→C (§15.4): si el camino A NO es usable — la plataforma no tiene detalle
(`build_detail_source` → None), falta el localizador (`DetailUnavailable`) o el token está
vencido/ausente (`AUTH_FAILED`) — el provider se DIFIERE y se refresca por BROWSE (C, `build_browse_source`,
una vez por provider, change-only). NUNCA se marca `is_available=false` por falta de camino A (eso es
solo "producto no encontrado con acceso válido"). Reusa F3.3: round-robin + abort-on-down.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from ..domain.coverage import StaleCovered, round_robin_by_store
from ..domain.fetch_outcome import DetailUnavailable, FetchErrorKind, FetchOutcome
from ..domain.ports import CatalogSource, ProductDetailSource, RawCatalogEntry, StoreProductRepository
from .refresh_prices import RefreshCatalogPrices

# Puertos inyectables: construir el detail source por item (None = la plataforma no tiene detalle → C),
# el browse source por provider (fallback C), y clasificar el error de fetch sin acoplar a httpx.
BuildDetailSource = Callable[[StaleCovered], ProductDetailSource | None]
BuildBrowseSource = Callable[[str], CatalogSource | None]
ClassifyFetchError = Callable[[Exception], FetchOutcome]
# El CONJUNTO de store_products viejos a re-preciar. Por defecto = los cubiertos (F3.2a); el asset
# `price_refresh` inyecta `list_stale_known` (TODO lo conocido con locator, matcheado o en revisión —
# paridad con el Prices Batch de SRD). El loop (path A + fallback C + F3.3) es idéntico para ambos.
StaleSource = Callable[[str, datetime | None], list[StaleCovered]]
# §14.3 (F3.2b): la búsqueda DIRIGIDA por barcode para re-encontrar un producto cuyo localizador
# murió. `None` (default) = sin recovery → el comportamiento previo (A no lo encuentra → se oculta).
BuildRecoverySource = Callable[[StaleCovered, str], CatalogSource | None]


def _reraise_classifier(exc: Exception) -> FetchOutcome:
    return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)


@dataclass(frozen=True, slots=True)
class FreshnessResult:
    checked: int             # store_products viejos que se intentaron por camino A (detail)
    refreshed: int           # re-fetch OK → change-only (precio igual o nuevo)
    unavailable: int         # A no lo encontró CON acceso válido → is_available=false
    stores_aborted: int = 0  # tiendas caídas (503/timeout) cuyos items restantes se saltaron
    browsed_providers: int = 0  # providers diferidos a browse (sin detail / sin token / sin localizador)


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
        build_browse_source: BuildBrowseSource | None = None,
        classify_error: ClassifyFetchError = _reraise_classifier,
        stale_source: StaleSource | None = None,
        build_recovery_source: BuildRecoverySource | None = None,
    ) -> None:
        self._build_recovery_source = build_recovery_source
        self._store_repo = store_repo
        self._refresh = refresh
        self._build_detail_source = build_detail_source
        self._build_browse_source = build_browse_source
        self._classify_error = classify_error
        # None → covered-only (F3.2a). El asset price_refresh inyecta list_stale_known.
        self._stale_source = stale_source or store_repo.list_stale_covered

    def execute(
        self, market_id: str, *, now: datetime | None = None, captured_at: datetime | None = None
    ) -> FreshnessResult:
        checked = refreshed = unavailable = 0
        items = round_robin_by_store(self._stale_source(market_id, now))
        down: set[str] = set()      # tiendas caídas (503/timeout) → abort de sus items restantes
        deferred: set[str] = set()  # providers sin camino A usable → refresh por browse (C)
        for item in items:
            if item.provider_id in down or item.provider_id in deferred:
                continue
            source = self._build_detail_source(item)
            if source is None:
                deferred.add(item.provider_id)  # la plataforma no tiene detalle → browse
                continue
            checked += 1
            try:
                entry = source.fetch_by_external_id(item.external_id, item.url, item.source_ref)
            except DetailUnavailable:
                deferred.add(item.provider_id)  # sin localizador → browse (no es "no encontrado")
                continue
            except Exception as exc:  # noqa: BLE001 — se clasifica; los no-transitorios se re-lanzan
                outcome = self._classify_error(exc)
                if outcome.retryable:
                    down.add(item.provider_id)  # backend caído → abortar la tienda
                    continue
                if outcome.kind is FetchErrorKind.AUTH_FAILED:
                    deferred.add(item.provider_id)  # token vencido/ausente → browse
                    continue
                raise  # fatal (bug/parseo) → NO se silencia
            if entry is None:
                # A lo buscó CON acceso válido y ya no está. Antes de ocultarlo, B intenta
                # re-encontrarlo por el EAN del canónico (§14.3) — quizá la tienda solo le rotó el id.
                if self._try_recover(item, captured_at):
                    refreshed += 1
                    continue
                # No se pudo recuperar de forma determinista → oculta (no borra, F3.0).
                self._store_repo.set_availability(item.store_product_id, False)
                unavailable += 1
            else:
                self._refresh.execute(_SingleEntrySource((entry,)), captured_at=captured_at)
                refreshed += 1

        browsed = self._browse_deferred(deferred, captured_at)
        return FreshnessResult(
            checked=checked, refreshed=refreshed, unavailable=unavailable,
            stores_aborted=len(down), browsed_providers=browsed,
        )

    def _try_recover(self, item: StaleCovered, captured_at: datetime | None) -> bool:
        """B (F3.2b, §14.3): el localizador murió → ¿la tienda sigue vendiendo el producto con otro id?

        La llave es el EAN del CANÓNICO (lo aporta cualquier tienda que lo tenga; Sirena/VTEX trae
        barcode al 100%) — por eso Cuadra puede recuperar donde SupermercadosRD no: ellos necesitan
        `product_shop_recovery_keys` por tienda porque no tienen EAN.

        Auto-repara SOLO si hay EXACTAMENTE UN candidato con EAN idéntico. Todo lo demás devuelve
        False → el producto se oculta y queda para un humano:
          · sin EAN conocido → la recuperación por nombre es Fase 2, nunca automática;
          · EAN distinto     → no es el mismo producto;
          · varios con el mismo EAN → ambiguo (mismo criterio que la COLISIÓN de la cascada de
            matching: >1 canónico con el mismo EAN → cola humana, jamás auto-link).
        Reparar mal es peor que no reparar: el canónico empezaría a mostrar el precio de OTRO
        producto, y al ser automático nadie lo revisa.
        """
        if self._build_recovery_source is None or item.canonical_product_id is None:
            return False
        ean = self._store_repo.find_ean_for_canonical(item.canonical_product_id)
        if not ean:
            return False
        source = self._build_recovery_source(item, ean)
        if source is None:
            return False
        exact = [e for e in source.fetch() if e.ean and e.ean == ean]
        if len(exact) != 1:
            return False
        found = exact[0]
        self._store_repo.repair_locator(item.store_product_id, found.external_id, found.url)
        self._refresh.execute(_SingleEntrySource((found,)), captured_at=captured_at)
        return True

    def _browse_deferred(self, deferred: set[str], captured_at: datetime | None) -> int:
        """Fallback C: refresca por BROWSE (catálogo completo, change-only) UNA vez por provider
        diferido. Sin `build_browse_source` inyectado, no hay fallback (se saltan)."""
        if self._build_browse_source is None:
            return 0
        browsed = 0
        for provider_id in deferred:
            browse = self._build_browse_source(provider_id)
            if browse is None:
                continue
            self._refresh.execute(browse, captured_at=captured_at)
            browsed += 1
        return browsed

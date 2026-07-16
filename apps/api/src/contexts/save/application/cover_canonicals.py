"""`CoverCanonicals` — Loop B / cobertura dirigida (F3.1).

Recorre los (canónico × tienda) SIN cubrir (`list_uncovered`), y por cada uno arma una consulta
DIRIGIDA (EAN-first, §12.1) y busca ese canónico exacto en esa tienda. Los candidatos entran al MISMO
pipeline de refresh (`RefreshCatalogPrices`: `record_observation` + la cascada de matching), que valida
y enlaza al canónico correcto o encola a revisión. **NUNCA crea canónicos** (eso es Loop A). Si la
tienda no devuelve nada, no pasa nada (el par sigue sin cubrir hasta la próxima corrida).

Insight de diseño: Loop B NO necesita una "validación dirigida" nueva — reusa la cascada
(`cuadra-save-matching`). Lo único distinto vs Loop A es QUÉ productos entran: hallados por búsqueda
dirigida a un canónico, no por búsqueda amplia de términos. El `build_adapter` es un puerto inyectable
(en prod: `CatalogSourceFactory` + `for_query` con SSRF-guard; en tests: un adapter falso).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from ..domain.candidate_selection import select_best_candidate
from ..domain.coverage import round_robin_by_store
from ..domain.directed_query import (
    DirectedCapability,
    DirectedQuery,
    build_directed_query,
    platform_capability,
)
from ..domain.entities import Provider, StoreRegistry
from ..domain.fetch_outcome import FetchErrorKind, FetchOutcome
from ..domain.ports import (
    CanonicalProductRepository,
    CatalogSource,
    ProviderRepository,
    RawCatalogEntry,
    StoreProductRepository,
    StoreRegistryRepository,
)
from .refresh_prices import RefreshCatalogPrices

# Puerto: construye el adapter dirigido para (fuente, tienda, consulta). Inyectable → testeable sin red.
BuildAdapter = Callable[[StoreRegistry, Provider, DirectedQuery], CatalogSource]

# Puerto: traduce un error de fetch al outcome tipado (retryable/hide). Inyectable → sin httpx en
# la aplicación. En prod = `classify_httpx_error` (infra); en tests = un fake.
ClassifyFetchError = Callable[[Exception], FetchOutcome]

# Puerto: ¿esta fuente admite consulta dirigida, y su búsqueda matchea por EAN? Inyectable porque la
# respuesta puede depender del PROFILE (REST_CATALOG es un adapter genérico), y los profiles viven en
# infraestructura — el use-case no puede ni debe conocerlos.
DirectedCapabilityOf = Callable[[StoreRegistry], DirectedCapability]
# Puerto: espera ENTRE requests — la otra mitad del rate limiting de SRD (`scrape-many.ts`:
# `randomDelay(600,1200)` entre rondas). `round_robin_by_store` SOLO reordena; con una tienda el
# intercalado es un no-op. Inyectable → los tests no duermen; prod wirea la espera real con jitter.
Pace = Callable[[], None]


def _no_pace() -> None:
    """Default PURO: sin espera. Prod DEBE inyectar la real (hay un test de composición que lo
    verifica: olvidarse de wirear la protección es exactamente cómo aparecieron los 429)."""


def _reraise_classifier(exc: Exception) -> FetchOutcome:
    """Default PURO: sin clasificador inyectado, todo error es FATAL (no reintentable) → el use-case
    lo propaga (comportamiento previo a F3.3). Prod inyecta el clasificador httpx real."""
    return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)


def _platform_capability_of(source: StoreRegistry) -> DirectedCapability:
    """Default PURO: sin resolver inyectado, la capacidad se deduce solo de la plataforma → las
    browse-only se saltean (comportamiento previo). Prod inyecta `directed_capability` (infra), que
    además mira el profile y habilita las REST con lookup por EAN (Bravo)."""
    return platform_capability(source.platform)


@dataclass(frozen=True, slots=True)
class CoverageResult:
    pairs_attempted: int   # (canónico×tienda) sin cubrir que se intentaron (incluye el que hizo caer la tienda)
    seen: int              # candidatos que devolvieron las tiendas (dry de la cascada)
    matched: int           # candidatos enrutados a la cascada (enlace/cola)
    stores_aborted: int = 0  # tiendas que cayeron (503/timeout) y cuyos pares restantes se saltaron


@dataclass(frozen=True, slots=True)
class _SelectedSource:
    """`CatalogSource` en-memoria con SOLO el candidato elegido para el objetivo → la cascada corre
    sobre ese uno, no sobre los ~65 crudos de la búsqueda (fix cobertura dirigida)."""

    entries: tuple[RawCatalogEntry, ...]

    def fetch(self) -> tuple[RawCatalogEntry, ...]:
        return self.entries


class CoverCanonicals:
    def __init__(
        self,
        *,
        store_repo: StoreProductRepository,
        canonical_repo: CanonicalProductRepository,
        source_repo: StoreRegistryRepository,
        provider_repo: ProviderRepository,
        refresh: RefreshCatalogPrices,
        build_adapter: BuildAdapter,
        classify_error: ClassifyFetchError = _reraise_classifier,
        capability_of: DirectedCapabilityOf = _platform_capability_of,
        pace: Pace = _no_pace,
    ) -> None:
        self._pace = pace
        self._store_repo = store_repo
        self._canonical_repo = canonical_repo
        self._source_repo = source_repo
        self._provider_repo = provider_repo
        self._refresh = refresh
        self._build_adapter = build_adapter
        self._classify_error = classify_error
        self._capability_of = capability_of

    def execute(self, market_id: str, *, captured_at: datetime | None = None) -> CoverageResult:
        pairs_attempted = seen = matched = 0
        # Round-robin por tienda (F3.3): reparte la carga y detecta temprano una tienda caída.
        pairs = round_robin_by_store(self._store_repo.list_uncovered(market_id))
        down: set[str] = set()  # tiendas caídas en esta corrida → se saltan sus pares restantes
        for pair in pairs:
            if pair.provider_id in down:
                continue  # abort-on-down (SRD §3.1): la tienda ya cayó, no la martillamos más
            canonical = self._canonical_repo.get_by_id(pair.canonical_product_id)
            source = self._source_repo.get_by_provider_id(pair.provider_id)
            provider = self._provider_repo.get_by_id(pair.provider_id)
            if canonical is None or source is None or provider is None:
                continue  # el par referencia algo que ya no existe → se salta
            capability = self._capability_of(source)
            if not capability.supported:
                continue  # tienda browse-only (navega el catálogo, ignora la query) → es de Loop A

            ean = self._store_repo.find_ean_for_canonical(pair.canonical_product_id)
            query = build_directed_query(
                name=canonical.name,
                display_size=canonical.display_size,
                ean=ean,
                store_supports_ean=capability.by_ean,
            )
            adapter = self._build_adapter(source, provider, query)
            if pairs_attempted:
                self._pace()  # ENTRE requests, nunca antes del primero (SRD `scrape-many.ts`)
            pairs_attempted += 1
            try:
                candidates = list(adapter.fetch())  # aquí ocurre el HTTP → abort-on-down envuelve esto
            except Exception as exc:  # noqa: BLE001 — se clasifica; los no-transitorios se re-lanzan
                outcome = self._classify_error(exc)
                if outcome.retryable:
                    down.add(pair.provider_id)  # backend caído → abortar la tienda esta corrida
                    continue
                raise  # error fatal (bug/parseo) → NO se silencia
            # Cobertura DIRIGIDA: solo el mejor candidato PARA este canónico entra a la cascada,
            # no los ~65 crudos. La cascada decide el enlace (auto-link determinista si es fuerte).
            best = select_best_candidate(
                target_name=canonical.name, target_ean=ean, candidates=candidates
            )
            if best is None:
                continue  # nada relevante en esta tienda esta corrida → el canónico sigue sin cubrir
            result = self._refresh.execute(_SelectedSource((best,)), captured_at=captured_at)
            seen += result.seen
            matched += result.matched
        return CoverageResult(
            pairs_attempted=pairs_attempted, seen=seen, matched=matched, stores_aborted=len(down)
        )

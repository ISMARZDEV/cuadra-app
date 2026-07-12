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

from ..domain.directed_query import DirectedQuery, build_directed_query, supports_ean
from ..domain.entities import Provider, StoreRegistry
from ..domain.ports import (
    CanonicalProductRepository,
    CatalogSource,
    ProviderRepository,
    StoreProductRepository,
    StoreRegistryRepository,
)
from .refresh_prices import RefreshCatalogPrices

# Puerto: construye el adapter dirigido para (fuente, tienda, consulta). Inyectable → testeable sin red.
BuildAdapter = Callable[[StoreRegistry, Provider, DirectedQuery], CatalogSource]


@dataclass(frozen=True, slots=True)
class CoverageResult:
    pairs_attempted: int   # (canónico×tienda) sin cubrir que se intentaron
    seen: int              # candidatos que devolvieron las tiendas (dry de la cascada)
    matched: int           # candidatos enrutados a la cascada (enlace/cola)


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
    ) -> None:
        self._store_repo = store_repo
        self._canonical_repo = canonical_repo
        self._source_repo = source_repo
        self._provider_repo = provider_repo
        self._refresh = refresh
        self._build_adapter = build_adapter

    def execute(self, market_id: str, *, captured_at: datetime | None = None) -> CoverageResult:
        pairs_attempted = seen = matched = 0
        for pair in self._store_repo.list_uncovered(market_id):
            canonical = self._canonical_repo.get_by_id(pair.canonical_product_id)
            source = self._source_repo.get_by_provider_id(pair.provider_id)
            provider = self._provider_repo.get_by_id(pair.provider_id)
            if canonical is None or source is None or provider is None:
                continue  # el par referencia algo que ya no existe → se salta

            ean = self._store_repo.find_ean_for_canonical(pair.canonical_product_id)
            query = build_directed_query(
                name=canonical.name,
                display_size=canonical.display_size,
                ean=ean,
                store_supports_ean=supports_ean(source.platform),
            )
            adapter = self._build_adapter(source, provider, query)
            result = self._refresh.execute(adapter, captured_at=captured_at)
            pairs_attempted += 1
            seen += result.seen
            matched += result.matched
        return CoverageResult(pairs_attempted=pairs_attempted, seen=seen, matched=matched)

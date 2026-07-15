"""`PreviewBasketQuery` (F2, canasta consultable): dry-run de un TÉRMINO contra la(s) tienda(s)
del mercado, para que el admin vea QUÉ devolvería cada tienda ANTES de agregarlo a la canasta
(features.md #14, SDD §3.3). Generaliza `TestSource` (por `source_id`) a "por query contra cada
fuente activa del mercado", agrupando por proveedor.

CERO persistencia (mismo criterio que `TestSource`): no recibe repos de escritura ni los llama —
es un dry-run. Reusa el mismo HTTP guardado por SSRF (`ssrf_guard.guarded_get/post`). Import de
infraestructura permitido en application (ADR 31 solo prohíbe `domain -> infrastructure`).

Graceful por tienda: una fuente mal configurada o un origen caído NO tumba el preview entero —
ese grupo trae `error` y las demás siguen devolviendo resultados (a diferencia de `TestSource`,
que es de UNA fuente y por eso propaga el error como 422/502).
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import islice

import httpx

from ..domain.ports import (
    ProviderRepository,
    RawCatalogEntry,
    StoreRegistryRepository,
)
from ..infrastructure.catalog_sources import ssrf_guard
from ..infrastructure.catalog_sources.factory import CatalogSourceFactory

_SAMPLE_SIZE = 10


@dataclass(frozen=True, slots=True)
class BasketPreviewGroup:
    """Lo que UNA tienda devolvería para el término. `error` None = ok; texto = esa fuente falló."""

    provider_id: str
    provider_name: str
    entries: tuple[RawCatalogEntry, ...] = ()
    error: str | None = None


class PreviewBasketQuery:
    """Dry-run de un término contra las fuentes del mercado (o una, si `provider_id`). Nunca persiste."""

    def __init__(
        self, source_repo: StoreRegistryRepository, provider_repo: ProviderRepository
    ) -> None:
        self._source_repo = source_repo
        self._provider_repo = provider_repo

    def execute(
        self, query_text: str, market_id: str, provider_id: str | None = None
    ) -> list[BasketPreviewGroup]:
        if provider_id is not None:
            source = self._source_repo.get_by_provider_id(provider_id)
            sources = [source] if source is not None else []
        else:
            sources = self._source_repo.list_by_market(market_id)

        groups: list[BasketPreviewGroup] = []
        for source in sources:
            provider = self._provider_repo.get_by_id(source.provider_id)
            if provider is None:
                continue
            groups.append(self._preview_one(source, provider, query_text))
        return groups

    def _preview_one(self, source, provider, query_text: str) -> BasketPreviewGroup:  # type: ignore[no-untyped-def]
        try:
            builder = CatalogSourceFactory.build(
                source.platform,
                source.base_url,
                endpoints=source.endpoints,
                headers=source.headers,
                auth=source.auth,
            )
            adapter = builder.for_query(
                provider.id,
                provider.market_id,
                query_text,
                http_get=ssrf_guard.guarded_get,
                http_post=ssrf_guard.guarded_post,
            )
            entries = tuple(islice(adapter.fetch(), _SAMPLE_SIZE))
        except (ValueError, ssrf_guard.SsrfBlockedError, httpx.HTTPError) as exc:
            return BasketPreviewGroup(provider.id, provider.name, error=str(exc))
        return BasketPreviewGroup(provider.id, provider.name, entries=entries)

"""`TestSource` (F2·B1/B3, Batch 3C, tareas 3.8-3.10): dry-run de una fuente (`store_registry`) —
el botón "probar" de features.md #13, ANTES de guardar/ingestar de verdad. Construye el adapter
real vía `CatalogSourceFactory` + `SourceBuilder.for_query`, pero le inyecta el HTTP guardado por
SSRF (`ssrf_guard.guarded_get`/`guarded_post`) en vez del `httpx.get/post` crudo por defecto —
mismo hook de inyección que ya usan los tests de los adapters (§6.2), reusado aquí en producción,
no solo en tests. Import de infraestructura permitido en application (mismo patrón que
`MatchStoreProduct` con `infrastructure.matching.cascade.*`) — el import-linter solo prohíbe
`domain -> infrastructure` (ADR 31), no `application -> infrastructure`.

CERO persistencia, siempre (tarea 3.8): este use case no recibe ni llama
`StoreProductRepository.record_observation` ni `ProductMatchRepository.record_match` — es un
dry-run, nunca escribe, ni en el camino feliz ni si `fetch()` explota a mitad de la iteración.

`query` se recibe como parámetro del use case hasta que `basket_query` (Batch 3D) aterrice — no
bloquea en eso (mismo criterio que 3.7 con `SourceBuilder.for_query`). `market_id` sale del
`Provider` (1:1 con la fuente), no de `StoreRegistry` (que no lo carga).
"""
from __future__ import annotations

from itertools import islice

import httpx

from ..domain.ports import ProviderRepository, RawCatalogEntry, StoreRegistryRepository
from ..infrastructure.catalog_sources import ssrf_guard
from ..infrastructure.catalog_sources.factory import CatalogSourceFactory

_SAMPLE_SIZE = 10


class TestSourceConfigError(Exception):
    """Config de la fuente inválida para el dry-run: plataforma sin adapter o SSRF-rechazada.

    El controller la mapea a 422 — es un problema de CÓMO está configurada la fuente, no una
    falla del origen externo."""


class TestSourceUpstreamError(Exception):
    """La fuente externa no respondió bien (timeout/conexión/HTTP error) — falla del origen.

    El controller la mapea a 502 — el request en sí era válido y pasó el guard SSRF."""


class TestSource:
    """Dry-run de una fuente ya registrada. Nunca persiste (features.md #13)."""

    def __init__(
        self, source_repo: StoreRegistryRepository, provider_repo: ProviderRepository
    ) -> None:
        self._source_repo = source_repo
        self._provider_repo = provider_repo

    def execute(self, source_id: str, query: str) -> list[RawCatalogEntry]:
        source = self._source_repo.get_by_id(source_id)
        if source is None:
            raise ValueError(f"Fuente no encontrada: {source_id!r}")
        provider = self._provider_repo.get_by_id(source.provider_id)
        if provider is None:
            raise ValueError(f"Provider no encontrado: {source.provider_id!r}")

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
                query,
                http_get=ssrf_guard.guarded_get,
                http_post=ssrf_guard.guarded_post,
            )
        except ValueError as exc:
            raise TestSourceConfigError(str(exc)) from exc

        try:
            return list(islice(adapter.fetch(), _SAMPLE_SIZE))
        except ssrf_guard.SsrfBlockedError as exc:
            raise TestSourceConfigError(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise TestSourceUpstreamError(str(exc)) from exc

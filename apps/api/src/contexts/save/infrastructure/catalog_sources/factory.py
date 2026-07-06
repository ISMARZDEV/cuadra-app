"""`CatalogSourceFactory` (F2·B1/B3, Batch 3B, tarea 3.7): traduce la config persistida en
`store_registry` (platform/base_url/headers/auth) al adapter concreto de ingesta (VTEX/Magento).

Generaliza el wiring hoy hardcodeado en `ingestion/save/sources.py::build_sources` — en
particular el caso Jumbo (misma instancia Magento CCN que Nacional, distinto store view via el
header `Store: jumbo`) se traduce aquí en `headers={"Store": "jumbo"} -> store_code="jumbo"`.

`build()` devuelve un `SourceBuilder` PARCIAL, no un `CatalogSource` completo: `store_registry`
es 1:1 con Provider y no carga `query`/`market_id` (esos viven en `basket_query`, tareas 3.13-3.16,
aún sin aterrizar en este batch). `SourceBuilder.for_query(provider_id, market_id, query)` cierra
los tres datos que faltan y construye el adapter real. El wiring completo N-queries-por-fuente
llega cuando `basket_query` esté disponible.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from ...domain.entities import SourcePlatform
from ...domain.ports import CatalogSource
from .magento_adapter import HttpPost, MagentoAdapter
from .vtex_adapter import VtexAdapter

_SUPPORTED_PLATFORMS = (SourcePlatform.VTEX, SourcePlatform.MAGENTO)


@dataclass(frozen=True, slots=True)
class SourceBuilder:
    """Config de fuente ya resuelta (platform/base_url/store_code); falta provider_id/market_id/query."""

    platform: SourcePlatform
    base_url: str
    store_code: str | None = None

    def for_query(
        self,
        provider_id: str,
        market_id: str,
        query: str,
        *,
        http_get: Callable[[str], list[dict]] | None = None,
        http_post: HttpPost | None = None,
    ) -> CatalogSource:
        """`http_get`/`http_post` son overrides opcionales (F2·B1/B3, Batch 3C) — el hook que usa
        `TestSource` para inyectar el HTTP SSRF-guardado (`ssrf_guard.py`) en el adapter real, en
        vez del `httpx.get`/`post` crudo por defecto. `None` (default) preserva el comportamiento
        previo de cada adapter — cambio retrocompatible, sin impacto en callers existentes."""
        if self.platform is SourcePlatform.VTEX:
            return VtexAdapter(self.base_url, provider_id, market_id, query, http_get=http_get)
        if self.platform is SourcePlatform.MAGENTO:
            return MagentoAdapter(
                self.base_url,
                provider_id,
                market_id,
                query,
                store_code=self.store_code,
                http_post=http_post,
            )
        raise ValueError(f"Plataforma sin adapter de ingesta: {self.platform!r}")


class CatalogSourceFactory:
    """Dispatcher platform -> adapter, a partir de la config persistida en `store_registry`."""

    @staticmethod
    def build(
        platform: SourcePlatform,
        base_url: str,
        endpoints: dict | None = None,
        headers: dict | None = None,
        auth: dict | None = None,
    ) -> SourceBuilder:
        if platform not in _SUPPORTED_PLATFORMS:
            raise ValueError(f"Plataforma sin adapter de ingesta: {platform!r}")
        store_code = (headers or {}).get("Store")
        return SourceBuilder(platform=platform, base_url=base_url, store_code=store_code)

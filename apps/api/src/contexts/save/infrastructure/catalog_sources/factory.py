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
from ...domain.ports import CatalogSource, ProductDetailSource
from .bravova_profile import BRAVOVA_PROFILE
from .magento_adapter import HttpPost, MagentoAdapter, MagentoProductDetailAdapter
from .rest_catalog_adapter import CatalogProfile, RestCatalogAdapter, RestCatalogDetailAdapter
from .source_auth import authed_http_get, authed_http_post, build_request_auth
from .vtex_adapter import VtexAdapter, VtexProductDetailAdapter

_DEFAULT_HEADERS = {"User-Agent": "Cuadra/Save"}

_SUPPORTED_PLATFORMS = (
    SourcePlatform.VTEX,
    SourcePlatform.MAGENTO,
    SourcePlatform.REST_CATALOG,
)

# Registro de profiles REST_CATALOG por clave (la que viaja en `endpoints["profile"]`).
# Sumar un súper con API propia = un `*_profile.py` nuevo + una entrada aquí. Nada más.
_REST_CATALOG_PROFILES: dict[str, CatalogProfile] = {
    "bravova": BRAVOVA_PROFILE,
}


@dataclass(frozen=True, slots=True)
class SourceBuilder:
    """Config de fuente ya resuelta (platform/base_url/store_code); falta provider_id/market_id/query."""

    platform: SourcePlatform
    base_url: str
    store_code: str | None = None
    endpoints: dict | None = None  # REST_CATALOG lee de aquí: profile, sections, store_id
    headers: dict | None = None    # §15: headers estáticos del registry (Host, User-Agent propio)
    auth: dict | None = None       # §15: credencial tipada (bearer/api_key/basic) — se aplica a la request

    def _request_auth(self):  # type: ignore[no-untyped-def]
        # "Store" es config (→ store_code), NO un header HTTP a mandar → se excluye.
        http_headers = {k: v for k, v in (self.headers or {}).items() if k != "Store"}
        return build_request_auth(http_headers, self.auth, defaults=_DEFAULT_HEADERS)

    def _has_credential(self) -> bool:
        ra = self._request_auth()
        return ra.headers != _DEFAULT_HEADERS or bool(ra.query)

    def _authed_get(self):  # type: ignore[no-untyped-def]
        return authed_http_get(self._request_auth()) if self._has_credential() else None

    def _authed_post(self) -> HttpPost | None:
        return authed_http_post(self._request_auth()) if self._has_credential() else None

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
            return VtexAdapter(
                self.base_url, provider_id, market_id, query, http_get=http_get or self._authed_get()
            )
        if self.platform is SourcePlatform.MAGENTO:
            return MagentoAdapter(
                self.base_url,
                provider_id,
                market_id,
                query,
                store_code=self.store_code,
                http_post=http_post or self._authed_post(),
            )
        if self.platform is SourcePlatform.REST_CATALOG:
            return self._build_rest_catalog(provider_id, market_id, http_get or self._authed_get())
        raise ValueError(f"Plataforma sin adapter de ingesta: {self.platform!r}")

    def for_detail(
        self,
        provider_id: str,
        market_id: str,
        *,
        http_get: Callable[[str], list[dict]] | None = None,
        http_post: HttpPost | None = None,
    ) -> ProductDetailSource:
        """`ProductDetailSource` de PRODUCCIÓN para F3.2a (camino A): re-fetch de UN producto por id.
        Solo plataformas con detalle por id (VTEX productId / Magento SKU). Las browse-only NO lo
        soportan (se refrescan por el browse de Loop A) — el use-case las salta antes de llegar aquí."""
        if self.platform is SourcePlatform.VTEX:
            return VtexProductDetailAdapter(
                self.base_url, provider_id, market_id, http_get=http_get or self._authed_get()
            )
        if self.platform is SourcePlatform.MAGENTO:
            return MagentoProductDetailAdapter(
                self.base_url, provider_id, market_id,
                store_code=self.store_code, http_post=http_post or self._authed_post(),
            )
        if self.platform is SourcePlatform.REST_CATALOG:
            # §15.4: REST con endpoint de detalle en el profile (Bravo /get). El use-case cae al
            # fallback por browse si el profile no lo declara o falta el token/localizador.
            return RestCatalogDetailAdapter(
                self.base_url, provider_id, market_id, self._rest_profile(),
                http_get=http_get or self._authed_get(),
            )
        raise ValueError(f"Plataforma sin ProductDetailSource: {self.platform!r}")

    def _rest_profile(self) -> CatalogProfile:
        profile = _REST_CATALOG_PROFILES.get((self.endpoints or {}).get("profile", ""))
        if profile is None:
            raise ValueError(
                f"REST_CATALOG sin profile registrado: {(self.endpoints or {}).get('profile')!r}"
            )
        return profile

    def _build_rest_catalog(
        self,
        provider_id: str,
        market_id: str,
        http_get: Callable[[str], dict] | None,
    ) -> CatalogSource:
        """REST_CATALOG (browse-full): el `query` NO aplica. Toda la config viene de `endpoints`:
        `profile` (clave del `_REST_CATALOG_PROFILES`), `sections` (categorías a iterar) y `store_id`."""
        endpoints = self.endpoints or {}
        profile = _REST_CATALOG_PROFILES.get(endpoints.get("profile", ""))
        if profile is None:
            raise ValueError(
                f"REST_CATALOG sin profile registrado: {endpoints.get('profile')!r}"
            )
        sections = endpoints.get("sections")
        store_id = endpoints.get("store_id")
        if not sections or not store_id:
            raise ValueError("REST_CATALOG requiere 'sections' y 'store_id' en endpoints")
        return RestCatalogAdapter(
            self.base_url,
            provider_id,
            market_id,
            profile,
            sections=list(sections),
            store_id=str(store_id),
            http_get=http_get,
        )


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
        return SourceBuilder(
            platform=platform, base_url=base_url, store_code=store_code, endpoints=endpoints,
            headers=headers, auth=auth,
        )

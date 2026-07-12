"""`RestCatalogAdapter` (§6.2): adapter GENÉRICO para APIs REST/JSON de catálogo a medida.

A diferencia de las plataformas de marca (VTEX/Magento/Shopify), muchos súper exponen una API propia
no-estándar. En vez de un adapter por cadena (anti-patrón, regla SAGRADA #4), este adapter concentra
la MECÁNICA común — `GET` por sección + paginación por offset + extracción de la lista/total desde el
envelope — y delega lo específico de cada súper a un `CatalogProfile` (path, nombres de params, llaves
del envelope, mapeo de item). Un súper nuevo = un profile nuevo, cero cambios acá.

Modelo **browse por sección** (NO query-based como VTEX/Magento): itera las secciones configuradas e
ingesta el catálogo COMPLETO de cada una hasta `totalCount`. El `http_get` se inyecta para testear sin red.
"""
from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from urllib.parse import quote, urlencode

from ...domain.ports import RawCatalogEntry
from .http_retry import request_with_retry

MapItem = Callable[[dict, str, str], RawCatalogEntry]  # (item, provider_id, market_id)


@dataclass(frozen=True, slots=True)
class CatalogProfile:
    """Describe una API REST/JSON de catálogo a medida. Todo lo que varía entre súper vive aquí."""

    resource_path: str          # p.ej. "/public/articulo/list"
    section_param: str          # query param de la sección/categoría
    store_param: str            # query param de la tienda/sucursal
    page_size_param: str        # query param del tamaño de página
    offset_param: str           # query param del offset
    list_path: tuple[str, ...]  # ruta a la lista de items en el envelope, p.ej. ("data", "list")
    total_path: tuple[str, ...]  # ruta al total de resultados, p.ej. ("data", "totalCount")
    map_item: MapItem           # mapea un item crudo → RawCatalogEntry (levanta ValueError si no hay precio)
    page_size: int = 30
    # params fijos extra que algunos súper EXIGEN en cada request (p.ej. Bravo Va → `showOrder`);
    # se URL-encodean. Pares (no dict) para mantener el profile inmutable/hashable.
    extra_params: tuple[tuple[str, str], ...] = field(default_factory=tuple)


def _dig(payload: object, path: tuple[str, ...]) -> object:
    """Navega un dict anidado por `path`; devuelve None si algún tramo falta o no es dict."""
    cur = payload
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


class RestCatalogAdapter:
    """CatalogSource genérico sobre una API REST/JSON de catálogo, configurado por un `CatalogProfile`."""

    def __init__(
        self,
        base_url: str,
        provider_id: str,
        market_id: str,
        profile: CatalogProfile,
        sections: list[str],
        store_id: str,
        page_size: int | None = None,
        http_get: Callable[[str], dict] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._profile = profile
        self._sections = sections
        self._store_id = store_id
        self._page_size = page_size if page_size is not None else profile.page_size
        self._http_get = http_get or self._default_get

    @staticmethod
    def _default_get(url: str) -> dict:
        resp = request_with_retry("GET", url, timeout=30.0, headers={"User-Agent": "Cuadra/Save"})
        resp.raise_for_status()
        return resp.json()

    def _page_url(self, section: str, offset: int) -> str:
        p = self._profile
        params = [
            (p.section_param, section),
            (p.store_param, self._store_id),
            (p.page_size_param, str(self._page_size)),
            (p.offset_param, str(offset)),
            *p.extra_params,
        ]
        query = urlencode(params, quote_via=quote)  # espacios → %20 (no `+`)
        return f"{self._base_url}{p.resource_path}?{query}"

    def fetch(self) -> Iterator[RawCatalogEntry]:
        p = self._profile
        for section in self._sections:
            offset = 0
            while True:
                payload = self._http_get(self._page_url(section, offset)) or {}
                items = _dig(payload, p.list_path) or []
                total = _dig(payload, p.total_path) or 0
                for item in items:
                    try:
                        yield p.map_item(item, self._provider_id, self._market_id)
                    except ValueError:
                        continue  # item sin precio → se salta, no rompe la corrida
                offset += self._page_size
                if not items or offset >= total:
                    break

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

from ...domain.fetch_outcome import DetailUnavailable
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
    # headers HTTP ESTRUCTURALES fijos de la plataforma (no secretos): p.ej. el User-Agent de la app
    # de Bravo (`Domicilio/…`) que su `/get` exige. Viven en el profile (código), NO en el admin — el
    # admin solo lleva el token (secreto). Los `headers` del registry los sobreescriben (retrocompat).
    # Pares (no dict) para mantener el profile inmutable/hashable, como `extra_params`.
    default_headers: tuple[tuple[str, str], ...] = field(default_factory=tuple)
    # §15.4 — DETALLE por artículo (camino A de frescura): endpoint de UN producto por su localizador.
    # Bravo: GET `/public/articulo/get?idArticulo=<id>` → `{"data": <artículo>}`. Vacío = sin detalle.
    detail_path: str | None = None          # p.ej. "/public/articulo/get"
    detail_param: str = ""                  # query param del id de detalle, p.ej. "idArticulo"
    detail_ref_key: str = ""                # llave en `source_ref`, p.ej. "id_articulo"
    detail_item_path: tuple[str, ...] = ()  # ruta al artículo único en el envelope, p.ej. ("data",)
    # LOOKUP EXACTO POR EAN (F3.1 Loop B + F3.2b recovery): query param que hace que el `list` filtre
    # por barcode. `None` = la fuente no sabe buscar por EAN → sigue siendo browse-only (Loop A).
    # Es capacidad del PROFILE, no de la plataforma: REST_CATALOG es un adapter genérico y cada súper
    # decide qué expone. Bravo: `model.filterByEan` (verificado en vivo 2026-07-15 — devuelve el
    # artículo exacto y funciona SIN filtro de sección, o sea es global sobre el catálogo).
    ean_param: str | None = None
    # BÚSQUEDA POR TEXTO (F3.1 Loop B — desbloqueo 2026-07-16): cubre los canónicos SIN EAN (los
    # nacidos de Magento), invisibles para el lookup por barcode. `None` = la fuente no busca por texto.
    # Bravo lo hace en un endpoint DISTINTO del browse y con otro `showOrder`, así que no reusa
    # `resource_path`/`extra_params`:
    text_param: str | None = None                 # query param del nombre (Bravo: model.nombreArticulo)
    search_path: str | None = None                # endpoint de búsqueda; default = resource_path
    # params fijos del `/search` — se usan EN LUGAR de `extra_params` (el `showOrder` del browse rompe
    # el search: Bravo exige `score`, no `importerankingArticulo asc`).
    search_extra_params: tuple[tuple[str, str], ...] = field(default_factory=tuple)
    text_max_results: int = 20                     # cap top-N por score (una request, como Magento)


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
        ean: str | None = None,
        text: str | None = None,
        pace: Callable[[], None] | None = None,
    ) -> None:
        if ean is not None and text is not None:
            raise ValueError("modo dirigido: `ean` y `text` son mutuamente excluyentes")
        if text is not None and not profile.text_param:
            raise ValueError("el profile no declara `text_param` → no sabe buscar por texto")
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._profile = profile
        self._sections = sections
        self._store_id = store_id
        self._page_size = page_size if page_size is not None else profile.page_size
        self._http_get = http_get or self._default_get
        # `ean` presente → modo DIRIGIDO (Loop B): una sola request filtrando por barcode, en vez de
        # navegar `sections`. Requiere `profile.ean_param`; el factory ya no lo construye así si falta.
        self._ean = ean
        # `text` presente → modo DIRIGIDO por nombre (Loop B, canónicos sin EAN): una request al
        # endpoint de búsqueda del profile. Cubre lo que el barcode no alcanza (los nacidos de Magento).
        self._text = text
        # Espera ENTRE requests. El browse pagina secciones enteras contra UNA tienda — el caso donde
        # `round_robin_by_store` ni participa. Bravo: 41 secciones × N páginas → sin pausa, 429.
        self._pace = pace or (lambda: None)

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

    def _ean_url(self, ean: str) -> str:
        """URL del lookup DIRIGIDO por barcode. SIN `section_param`: el filtro por EAN es global sobre
        el catálogo (verificado en vivo). La tienda SÍ va — el precio es por sucursal."""
        p = self._profile
        params = [
            (str(p.ean_param), ean),
            (p.store_param, self._store_id),
            (p.page_size_param, str(self._page_size)),
            (p.offset_param, "0"),
            *p.extra_params,
        ]
        return f"{self._base_url}{p.resource_path}?{urlencode(params, quote_via=quote)}"

    def _search_url(self, text: str) -> str:
        """URL de la búsqueda DIRIGIDA por nombre. Endpoint propio del profile (`search_path`), sin
        `section_param` (la búsqueda es global, como el EAN), capeada en `text_max_results` (top-N por
        score). Usa `search_extra_params`, NO las del browse (el `showOrder` del browse rompe el search)."""
        p = self._profile
        params = [
            (str(p.text_param), text),
            (p.store_param, self._store_id),  # la tienda importa: el precio es por sucursal
            (p.page_size_param, str(p.text_max_results)),
            (p.offset_param, "0"),
            *p.search_extra_params,
        ]
        path = p.search_path or p.resource_path
        return f"{self._base_url}{path}?{urlencode(params, quote_via=quote)}"

    def _fetch_by_ean(self, ean: str) -> Iterator[RawCatalogEntry]:
        """Loop B: pedirle a la tienda UN producto por barcode. 0 resultados = no lo vende (no cubierto),
        NO un error. Una request, sin browse, sin paginar: por eso Loop B puede correr en fuentes REST."""
        p = self._profile
        payload = self._http_get(self._ean_url(ean)) or {}
        for item in _dig(payload, p.list_path) or []:
            try:
                yield p.map_item(item, self._provider_id, self._market_id)
            except ValueError:
                continue  # item sin precio → se salta, igual que en el browse

    def _fetch_by_text(self, text: str) -> Iterator[RawCatalogEntry]:
        """Loop B: buscar el canónico por NOMBRE cuando no hay EAN. Una request (top-N por score); el
        use-case elige el mejor candidato (`select_best_candidate`), no persiste los N. 0 resultados =
        no cubierto, no un error — igual que el lookup por EAN."""
        p = self._profile
        payload = self._http_get(self._search_url(text)) or {}
        for item in _dig(payload, p.list_path) or []:
            try:
                yield p.map_item(item, self._provider_id, self._market_id)
            except ValueError:
                continue  # item sin precio → se salta, igual que en el browse

    def fetch(self) -> Iterator[RawCatalogEntry]:
        p = self._profile
        if self._ean is not None:
            yield from self._fetch_by_ean(self._ean)
            return
        if self._text is not None:
            yield from self._fetch_by_text(self._text)
            return
        first = True
        for section in self._sections:
            offset = 0
            while True:
                if not first:
                    self._pace()  # ENTRE requests, nunca antes del primero (SRD `scrape-many.ts`)
                first = False
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


class RestCatalogDetailAdapter:
    """`ProductDetailSource` para APIs REST con endpoint de UN artículo (§15.4, camino A de frescura).

    Bravo: `GET {base}/public/articulo/get?idArticulo=<source_ref.id_articulo>` con la auth del
    registry (el `http_get` que inyecta la factory ya la aplica). El `external_id` (idexterno) NO sirve
    para el `/get` → se usa `source_ref[detail_ref_key]`. Sin ese localizador o sin `detail_path` en el
    profile → `DetailUnavailable` (el use-case cae al fallback por browse, NO marca `is_available=false`).
    """

    def __init__(
        self,
        base_url: str,
        provider_id: str,
        market_id: str,
        profile: CatalogProfile,
        http_get: Callable[[str], dict] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._profile = profile
        self._http_get = http_get or RestCatalogAdapter._default_get

    def fetch_by_external_id(
        self, external_id: str, url: str | None = None, source_ref: dict | None = None
    ) -> RawCatalogEntry | None:
        p = self._profile
        if not p.detail_path or not p.detail_ref_key:
            raise DetailUnavailable(f"profile sin endpoint de detalle: {p.resource_path!r}")
        locator = (source_ref or {}).get(p.detail_ref_key)
        if not locator:
            raise DetailUnavailable(f"sin {p.detail_ref_key!r} en source_ref → no hay camino A")
        detail_url = (
            f"{self._base_url}{p.detail_path}?{urlencode({p.detail_param: str(locator)}, quote_via=quote)}"
        )
        payload = self._http_get(detail_url) or {}
        item = _dig(payload, p.detail_item_path)
        if not isinstance(item, dict) or not item:
            return None  # el artículo ya no está → is_available=false
        try:
            return p.map_item(item, self._provider_id, self._market_id)
        except ValueError:
            return None

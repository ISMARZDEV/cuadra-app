"""`MagentoAdapter` (§6.2): ingesta desde el GraphQL abierto de Magento (Nacional, Jumbo).

`POST {base}/graphql` — query `products(search:...)` con precio en
`price_range.minimum_price.final_price` (decimal + currency EXPLÍCITA en el payload →
Money.from_major, sin float, §12·B). Mapea a `RawCatalogEntry`. Nacional y Jumbo comparten
instancia (CCN); el store view se selecciona con el header `Store` (doc 09: `jumbo` →
catálogo/precios de Jumbo), por eso `store_code` es parámetro. La API no expone marca ni
EAN (los resuelve el matching). El `http_post` se inyecta para testear el mapeo sin red.
Paginación `pageSize`/`currentPage` guiada por `page_info.total_pages`.
"""
from __future__ import annotations

from collections.abc import Callable, Iterator

from src.shared.money import Currency, Money

from ...domain.entities import PriceType
from ...domain.ports import RawCatalogEntry
from .http_retry import request_with_retry
from .size_from_name import extract_size

_PAGE_SIZE = 50

# Cuántos resultados se ingieren por término. La búsqueda de Magento (`products(search:)`) es DIFUSA
# y hace OR de los tokens: "habichuelas rojas la famosa" devuelve 704 productos y desde el puesto 3
# son AMBIENTADORES (matchean por "rojos"). Cuantas más palabras tiene el término, MÁS basura trae.
# Drenar ese set completo era el inundador real de la cola: 1502 productos de Jumbo en una corrida
# de 8 términos, cada uno embebido con BGE-M3 y enviado a revisión humana.
#
# El número sale de MEDIR (Jumbo, 2026-07-15), no de intuición. Posición del ÚLTIMO relevante:
#   arroz la garza 7 · habichuelas rojas la famosa 2 · aceite mazola 7
#   arroz integral 8 · leche evaporada 15 · azucar crema 12  ← posiciones NO contiguas (ruido entre medio)
# top-10 habría perdido 5 relevantes de "leche evaporada" y 1 de "azucar crema". top-20 conserva
# el 100% de los 6 términos y descarta ~97% del ruido. Cabe en UNA página → también ahorra requests.
#
# NO aplica a VTEX: su `ft=` es full-text preciso (mismo término → 6 resultados, no 704).
MAGENTO_MAX_RESULTS = 20

_PRODUCTS_QUERY = """
query CuadraSaveCatalog($search: String!, $pageSize: Int!, $currentPage: Int!) {
  products(search: $search, pageSize: $pageSize, currentPage: $currentPage) {
    total_count
    page_info { total_pages }
    items {
      name
      sku
      url_key
      price_range { minimum_price { final_price { value currency } } }
      small_image { url }
      categories { name level }
    }
  }
}
"""

HttpPost = Callable[[str, dict, dict[str, str]], dict]


def _final_price(item: dict) -> tuple[float | int | str, str]:
    final = ((item.get("price_range") or {}).get("minimum_price") or {}).get("final_price") or {}
    value = final.get("value")
    if value is None:
        raise ValueError(f"Producto Magento sin precio: {item.get('sku')!r}")
    return value, final.get("currency", "")


def map_magento_product(
    item: dict, provider_id: str, market_id: str, base_url: str
) -> RawCatalogEntry:
    """Mapea un producto del GraphQL Magento a `RawCatalogEntry`. ValueError si no hay precio."""
    value, currency_code = _final_price(item)
    price = Money.from_major(str(value), Currency(currency_code))

    name = item.get("name", "")
    categories = sorted(item.get("categories") or [], key=lambda c: c.get("level", 0))
    url_key = item.get("url_key")
    image = item.get("small_image") or {}

    return RawCatalogEntry(
        provider_id=provider_id,
        market_id=market_id,
        external_id=str(item.get("sku", "")),
        name=name,
        brand="",  # no expuesto por la API → lo resuelve el matching
        size_text=extract_size(name),
        price=price,
        price_type=PriceType.ONLINE,
        source="magento",
        category_path=tuple(c["name"] for c in categories if c.get("name")),
        ean=None,  # no expuesto por la API
        url=f"{base_url.rstrip('/')}/{url_key}" if url_key else None,
        image_url=image.get("url"),
    )


class MagentoAdapter:
    """CatalogSource sobre GraphQL de Magento. Un store view por instancia via `Store` header."""

    def __init__(
        self,
        base_url: str,
        provider_id: str,
        market_id: str,
        query: str,
        store_code: str | None = None,
        http_post: HttpPost | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._query = query
        self._store_code = store_code
        self._http_post = http_post or self._default_post

    @staticmethod
    def _default_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        resp = request_with_retry("POST", url, json=payload, headers=headers, timeout=30.0)
        resp.raise_for_status()
        return resp.json()

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "Cuadra/Save", "Content-Type": "application/json"}
        if self._store_code:
            headers["Store"] = self._store_code
        return headers

    def _page(self, current_page: int) -> dict:
        payload = {
            "query": _PRODUCTS_QUERY,
            "variables": {
                "search": self._query,
                "pageSize": _PAGE_SIZE,
                "currentPage": current_page,
            },
        }
        response = self._http_post(f"{self._base_url}/graphql", payload, self._headers())
        return (response.get("data") or {}).get("products") or {}

    def fetch(self) -> Iterator[RawCatalogEntry]:
        """Los `MAGENTO_MAX_RESULTS` más relevantes del término, NO el set difuso completo.

        Magento ordena por relevancia y los productos que de verdad importan viven en los primeros
        puestos (medido: el último relevante nunca pasó del 15 en 6 términos). Drenar hasta
        `total_pages` traía cientos de productos que solo comparten UNA palabra con la consulta.
        El corte se aplica sobre los items CRUDOS (posición tal como los ordenó la tienda), antes de
        descartar los que no tienen precio — así el cap significa "los 20 primeros que la tienda
        considera más relevantes", no "los 20 primeros que además tenían precio"."""
        current_page = 1
        total_pages = 1
        taken = 0
        while current_page <= total_pages and taken < MAGENTO_MAX_RESULTS:
            products = self._page(current_page)
            total_pages = (products.get("page_info") or {}).get("total_pages", 0)
            items = products.get("items") or []
            if not items:
                break
            for item in items:
                if taken >= MAGENTO_MAX_RESULTS:
                    break
                taken += 1
                try:
                    yield map_magento_product(
                        item, self._provider_id, self._market_id, self._base_url
                    )
                except ValueError:
                    continue  # producto sin precio → se salta, no rompe la corrida
            current_page += 1


_DETAIL_QUERY = """
query CuadraSaveDetail($sku: String!) {
  products(filter: { sku: { eq: $sku } }) {
    items {
      name
      sku
      url_key
      price_range { minimum_price { final_price { value currency } } }
      small_image { url }
      categories { name level }
    }
  }
}
"""


class MagentoProductDetailAdapter:
    """`ProductDetailSource` Magento (F3.2a, camino A): re-fetch de UN producto por `sku`
    (`filter: {sku: {eq}}`) — 1 request = 1 producto. None si la tienda ya no lo tiene."""

    def __init__(
        self,
        base_url: str,
        provider_id: str,
        market_id: str,
        store_code: str | None = None,
        http_post: HttpPost | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._store_code = store_code
        self._http_post = http_post or MagentoAdapter._default_post

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "Cuadra/Save", "Content-Type": "application/json"}
        if self._store_code:
            headers["Store"] = self._store_code
        return headers

    def fetch_by_external_id(
        self, external_id: str, url: str | None = None, source_ref: dict | None = None
    ) -> RawCatalogEntry | None:
        payload = {"query": _DETAIL_QUERY, "variables": {"sku": external_id}}
        response = self._http_post(f"{self._base_url}/graphql", payload, self._headers())
        items = ((response.get("data") or {}).get("products") or {}).get("items") or []
        if not items:
            return None  # ya no está → is_available=false (o fallback B en F3.2b)
        try:
            return map_magento_product(items[0], self._provider_id, self._market_id, self._base_url)
        except ValueError:
            return None

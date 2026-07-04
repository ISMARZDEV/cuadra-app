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

import httpx

from src.shared.money import Currency, Money

from ...domain.entities import PriceType
from ...domain.ports import RawCatalogEntry
from .size_from_name import extract_size

_PAGE_SIZE = 50

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
        resp = httpx.post(url, json=payload, headers=headers, timeout=30.0)
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
        current_page = 1
        total_pages = 1
        while current_page <= total_pages:
            products = self._page(current_page)
            total_pages = (products.get("page_info") or {}).get("total_pages", 0)
            items = products.get("items") or []
            if not items:
                break
            for item in items:
                try:
                    yield map_magento_product(
                        item, self._provider_id, self._market_id, self._base_url
                    )
                except ValueError:
                    continue  # producto sin precio → se salta, no rompe la corrida
            current_page += 1

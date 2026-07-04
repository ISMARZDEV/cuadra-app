"""`VtexAdapter` (§6.2): ingesta desde la API pública de catálogo de VTEX (Sirena, etc.).

`GET {base}/api/catalog_system/pub/products/search?ft=..&_from=..&_to=..` → JSON con precio en
`items[].sellers[].commertialOffer.Price`. Mapea a `RawCatalogEntry`. Precio vía `Money.from_major`
(sin float, §12·B). Moneda derivada del `market_id` (multi-país). El `http_get` se inyecta para
testear el mapeo sin red. Paginación `_from/_to` (50/pág, cap 2500 → segmentar por categoría luego).
"""
from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from urllib.parse import quote

import httpx

from src.shared.money import Currency, Money, primary_currency_for_market

from ...domain.entities import PriceType
from ...domain.ports import RawCatalogEntry

_PAGE_SIZE = 50
_MAX_FROM = 2500  # límite duro de la API legacy de VTEX

_SIZE_IN_NAME = re.compile(
    r"\d+(?:[.,]\d+)?\s*"
    r"(?:lbs?|libras?|kg|kgs|kilos?|gr?|grs|gramos?|oz|onzas?|lt?s?|litros?|ml|gl|gal|gal[oó]n"
    r"|und|un|uds|unidad(?:es)?)\b",
    re.IGNORECASE,
)


def _extract_size(name: str) -> str:
    """Extrae el último token de tamaño del nombre ("Arroz ... 5lb" → "5lb"). Best-effort."""
    matches = list(_SIZE_IN_NAME.finditer(name))
    return matches[-1].group(0).strip() if matches else ""


def _parse_category_path(path: str) -> tuple[str, ...]:
    return tuple(p for p in path.split("/") if p.strip())


def _first_price_major(item: dict) -> float | int | str:
    for it in item.get("items", []):
        for seller in it.get("sellers", []):
            offer = seller.get("commertialOffer") or {}
            price = offer.get("Price")
            if price is not None:
                return price
    raise ValueError(f"Producto VTEX sin precio: {item.get('productId')!r}")


def map_vtex_product(item: dict, provider_id: str, market_id: str) -> RawCatalogEntry:
    """Mapea un producto del JSON VTEX a `RawCatalogEntry`. Levanta ValueError si no hay precio."""
    currency = Currency(primary_currency_for_market(market_id))
    price = Money.from_major(str(_first_price_major(item)), currency)

    items = item.get("items") or []
    first = items[0] if items else {}
    images = first.get("images") or []
    categories = item.get("categories") or []
    name = item.get("productName", "")

    return RawCatalogEntry(
        provider_id=provider_id,
        market_id=market_id,
        external_id=str(item.get("productId", "")),
        name=name,
        brand=item.get("brand", ""),
        size_text=_extract_size(name),
        price=price,
        price_type=PriceType.ONLINE,
        source="vtex",
        category_path=_parse_category_path(categories[0]) if categories else (),
        ean=first.get("ean"),
        url=item.get("link"),
        image_url=images[0].get("imageUrl") if images else None,
    )


class VtexAdapter:
    """CatalogSource sobre la API pública de VTEX. Reusable en cualquier tienda/país VTEX."""

    def __init__(
        self,
        base_url: str,
        provider_id: str,
        market_id: str,
        query: str,
        http_get: Callable[[str], list[dict]] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._provider_id = provider_id
        self._market_id = market_id
        self._query = query
        self._http_get = http_get or self._default_get

    @staticmethod
    def _default_get(url: str) -> list[dict]:
        resp = httpx.get(url, timeout=30.0, headers={"User-Agent": "Cuadra/Save"})
        resp.raise_for_status()
        return resp.json()

    def _page_url(self, frm: int, to: int) -> str:
        return (
            f"{self._base_url}/api/catalog_system/pub/products/search"
            f"?ft={quote(self._query)}&_from={frm}&_to={to}"
        )

    def fetch(self) -> Iterator[RawCatalogEntry]:
        frm = 0
        while frm < _MAX_FROM:
            page = self._http_get(self._page_url(frm, frm + _PAGE_SIZE - 1))
            if not page:
                break
            for item in page:
                try:
                    yield map_vtex_product(item, self._provider_id, self._market_id)
                except ValueError:
                    continue  # producto sin precio → se salta, no rompe la corrida
            if len(page) < _PAGE_SIZE:
                break
            frm += _PAGE_SIZE

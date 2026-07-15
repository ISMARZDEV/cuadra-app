"""Unit — VtexAdapter (§6.2): mapea el JSON REAL de la API VTEX de Sirena → RawCatalogEntry.

Sin red: el mapeo es una función pura testeada contra el payload real (capturado en el spike,
doc 09); el fetch se prueba inyectando un page-fetcher falso. Multi-país: la moneda se deriva
del `market_id` (DO→DOP, US→USD). El precio pasa por Money.from_major (sin float, §12·B).
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import (
    VtexAdapter,
    map_vtex_product,
)
from src.shared.money import Currency, Money

# payload real (recortado) devuelto por
# https://www.sirena.do/api/catalog_system/pub/products/search?ft=arroz (doc 09)
SIRENA_ITEM = {
    "productId": "18365",
    "productName": "Arroz Selecto Wala 5lb",
    "brand": "WALA",
    "categories": [
        "/Supermercado/Despensa/Arroz, Habichuelas y otros granos/Arroz/",
        "/Supermercado/Despensa/",
        "/Supermercado/",
    ],
    "link": "https://www.sirena.do/wala-arroz-selecto-5lb-2010029/p",
    "items": [
        {
            "itemId": "12749",
            "ean": "2100003063755",
            "images": [{"imageUrl": "https://gruporamos.vteximg.com.br/arquivos/ids/172051/1-und.webp"}],
            "sellers": [
                {"sellerId": "1", "commertialOffer": {"Price": 169.0, "ListPrice": 169.0, "AvailableQuantity": 100}}
            ],
        }
    ],
}
DOP = Currency("DOP")


def test_map_vtex_product_full_fields() -> None:
    entry = map_vtex_product(SIRENA_ITEM, provider_id="p-sirena", market_id="DO")
    assert entry == RawCatalogEntry(
        provider_id="p-sirena",
        market_id="DO",
        external_id="18365",
        name="Arroz Selecto Wala 5lb",
        brand="WALA",
        size_text="5lb",
        price=Money(16900, DOP),  # 169.00 → minor units, sin float
        price_type=PriceType.ONLINE,
        source="vtex",
        category_path=("Supermercado", "Despensa", "Arroz, Habichuelas y otros granos", "Arroz"),
        ean="2100003063755",
        url="https://www.sirena.do/wala-arroz-selecto-5lb-2010029/p",
        image_url="https://gruporamos.vteximg.com.br/arquivos/ids/172051/1-und.webp",
    )


def test_map_derives_currency_from_market_multicountry() -> None:
    # mismo mapeo, mercado US → precio en USD (multi-país por market_id)
    entry = map_vtex_product(SIRENA_ITEM, provider_id="p-x", market_id="US")
    assert entry.price == Money(16900, Currency("USD"))
    assert entry.market_id == "US"


def test_map_extracts_plural_pound_size() -> None:
    # "10 Lbs" (plural) visto en vivo en Sirena — el extractor debe capturarlo
    item = {**SIRENA_ITEM, "productName": "Arroz Pimco Selecto 10 Lbs"}
    entry = map_vtex_product(item, provider_id="p-sirena", market_id="DO")
    assert entry.size_text == "10 Lbs"


def test_map_raises_without_price() -> None:
    broken = {**SIRENA_ITEM, "items": [{"itemId": "1", "sellers": []}]}
    with pytest.raises(ValueError):
        map_vtex_product(broken, provider_id="p-sirena", market_id="DO")


def test_fetch_paginates_and_yields_entries() -> None:
    calls: list[str] = []

    def fake_get(url: str) -> list[dict]:
        calls.append(url)
        return [SIRENA_ITEM] if "_from=0" in url else []

    adapter = VtexAdapter(
        base_url="https://www.sirena.do",
        provider_id="p-sirena",
        market_id="DO",
        query="arroz",
        http_get=fake_get,
    )
    entries = list(adapter.fetch())
    assert len(entries) == 1
    assert entries[0].external_id == "18365"
    assert "/api/catalog_system/pub/products/search" in calls[0]
    assert "ft=arroz" in calls[0] and "_from=0" in calls[0]

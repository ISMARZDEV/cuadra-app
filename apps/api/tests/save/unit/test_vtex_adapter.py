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
        # `2100003063755` (prefijo 210) es un código INTERNO de Sirena → no hay barcode. Este test
        # afirmaba `ean="2100003063755"`: consagraba el bug. Ver el bloque de abajo.
        ean=None,
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


# ── El barcode pasa por el filtro del dominio (R6, 2026-07-16) ────────────────────────────────
# Sirena es EL SEMBRADOR de barcodes (100% de cobertura, R7): es la tienda que hace efectivo el
# Proceso 2 (el job por EAN de Bravo) sobre los canónicos. Y sin embargo escribía `ean` CRUDO —
# `first.get("ean")`, sin normalizar ni filtrar. Bravo (`bravova_profile`) sí pasaba por
# `pick_global_ean`; VTEX no.
#
# Medido contra el DB de dev (2026-07-16): 33 de 63 filas con EAN (52%) violaban el invariante
# "GTIN-14 global normalizado, o NULL", y TODAS eran de Sirena. Un backfill sin arreglar esto se
# deshace en la próxima corrida.


def _sirena_item_with_ean(ean: str | None) -> dict:
    item = {**SIRENA_ITEM, "items": [{**SIRENA_ITEM["items"][0], "ean": ean}]}
    return item


def test_normalises_the_barcode_to_gtin14() -> None:
    # Sirena publica EAN-13; sale en la forma canónica para que converja con lo que escriba Bravo.
    entry = map_vtex_product(_sirena_item_with_ean("7460083780146"), "p", "DO")
    assert entry.ean == "07460083780146"


def test_rescues_the_upc_a_whose_leading_zero_was_eaten() -> None:
    # Caso REAL: 11 filas de Sirena con 11 dígitos. `41331026123` = "Arroz Goya Integral 2 Lb."
    # (41331 = prefijo UPC de Goya). Sin esto, esos canónicos quedan fuera del alcance del job por
    # EAN de Bravo — que es justamente lo que el sembrador existe para habilitar.
    entry = map_vtex_product(_sirena_item_with_ean("41331026123"), "p", "DO")
    assert entry.ean == "00041331026123"


def test_drops_the_stores_internal_barcode() -> None:
    # Caso REAL: `2100003063755` (prefijo 210, peso variable) llegaba intacto a la columna `ean`,
    # donde la etapa EAN auto-enlaza a 1.0 SIN revisión humana. Es el false merge que la doctrina
    # nombra como el peor caso posible.
    entry = map_vtex_product(_sirena_item_with_ean("2100003063755"), "p", "DO")
    assert entry.ean is None


def test_drops_the_stores_internal_gtin8() -> None:
    # Caso REAL: `21061684` = "Arroz Super Selecto Bisono 10 Lb". Es un GTIN-8 VÁLIDO, pero con
    # prefijo 2 → circulación restringida: un código propio de Sirena, inútil cross-tienda.
    entry = map_vtex_product(_sirena_item_with_ean("21061684"), "p", "DO")
    assert entry.ean is None


def test_tolerates_a_product_without_a_barcode() -> None:
    # `None` es un resultado sano: la cascada sigue por nombre/vector, que sí tiene red humana.
    assert map_vtex_product(_sirena_item_with_ean(None), "p", "DO").ean is None

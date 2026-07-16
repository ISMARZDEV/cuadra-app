"""Unit — MagentoAdapter (§6.2): mapea el JSON REAL del GraphQL de Nacional → RawCatalogEntry.

Sin red: el mapeo es una función pura testeada contra el payload real (capturado en vivo,
doc 09 §2). El fetch se prueba inyectando un http_post falso. Hallazgo del spike ronda 3:
Nacional y Jumbo comparten instancia Magento (CCN) y el store view se selecciona con el
header `Store` (`jumbo` → catálogo/precios de Jumbo) — por eso el adapter recibe `store_code`.
La moneda viene EXPLÍCITA en el payload (`final_price.currency`), no se deriva del market.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import (
    MAGENTO_MAX_RESULTS,
    MagentoAdapter,
    map_magento_product,
)
from src.shared.money import Currency, Money

# payload real (recortado) devuelto por
# POST https://supermercadosnacional.com/graphql — query products(search:"arroz") (doc 09)
NACIONAL_ITEM = {
    "__typename": "SimpleProduct",
    "name": "Arroz Selecto Líder 10 Lb",
    "sku": "2140283",
    "url_key": "arroz-selecto-lider-10-lb-2140283",
    "price_range": {"minimum_price": {"final_price": {"value": 327.95, "currency": "DOP"}}},
    "small_image": {
        "url": "https://supermercadosnacional.com/media/catalog/product/L/I/LIDER_ARROZ_SELECTO_10_LB.jpg"
    },
    "categories": [
        {"name": "Despensa", "url_path": "despensa", "level": 2},
        {"name": "Arroz, Cereales y Legumbres", "url_path": "despensa/arroz-cereales-y-legumbres", "level": 3},
        {"name": "Arroz", "url_path": "despensa/arroz-cereales-y-legumbres/arroz", "level": 4},
    ],
}
DOP = Currency("DOP")


def test_map_magento_product_full_fields() -> None:
    entry = map_magento_product(
        NACIONAL_ITEM, provider_id="p-nacional", market_id="DO",
        base_url="https://supermercadosnacional.com",
    )
    assert entry == RawCatalogEntry(
        provider_id="p-nacional",
        market_id="DO",
        external_id="2140283",
        name="Arroz Selecto Líder 10 Lb",
        brand="",  # Magento de CCN no expone marca (manufacturer=null) → la resuelve el matching
        size_text="10 Lb",
        price=Money(32795, DOP),  # 327.95 → minor units, sin float
        price_type=PriceType.ONLINE,
        source="magento",
        category_path=("Despensa", "Arroz, Cereales y Legumbres", "Arroz"),
        ean=None,  # no expuesto por la API
        url="https://supermercadosnacional.com/arroz-selecto-lider-10-lb-2140283",
        image_url="https://supermercadosnacional.com/media/catalog/product/L/I/LIDER_ARROZ_SELECTO_10_LB.jpg",
    )


def test_map_uses_payload_currency_not_market() -> None:
    # la moneda viene explícita del payload (a diferencia de VTEX, que la deriva del market)
    item = {
        **NACIONAL_ITEM,
        "price_range": {"minimum_price": {"final_price": {"value": 5.99, "currency": "USD"}}},
    }
    entry = map_magento_product(item, provider_id="p-x", market_id="DO", base_url="https://x.com")
    assert entry.price == Money(599, Currency("USD"))


def test_map_orders_category_path_by_level() -> None:
    # el payload no garantiza orden → el path canónico se ordena por `level`
    item = {**NACIONAL_ITEM, "categories": list(reversed(NACIONAL_ITEM["categories"]))}
    entry = map_magento_product(item, provider_id="p-x", market_id="DO", base_url="https://x.com")
    assert entry.category_path == ("Despensa", "Arroz, Cereales y Legumbres", "Arroz")


def test_map_extracts_onz_size() -> None:
    # nombre real de Jumbo: la abreviatura "Onz" debe capturarse como tamaño
    item = {**NACIONAL_ITEM, "name": "Rollo Crujiente De Arroz Blanco Sin Gluten J1, 3.5 Onz"}
    entry = map_magento_product(item, provider_id="p-x", market_id="DO", base_url="https://x.com")
    assert entry.size_text == "3.5 Onz"


def test_map_raises_without_price() -> None:
    broken = {**NACIONAL_ITEM, "price_range": {"minimum_price": {"final_price": {"value": None}}}}
    with pytest.raises(ValueError):
        map_magento_product(broken, provider_id="p-x", market_id="DO", base_url="https://x.com")


def test_fetch_paginates_and_yields_entries() -> None:
    calls: list[tuple[str, dict, dict[str, str]]] = []

    def fake_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        calls.append((url, payload, headers))
        return {
            "data": {
                "products": {
                    "total_count": 1,
                    "page_info": {"total_pages": 1},
                    "items": [NACIONAL_ITEM],
                }
            }
        }

    adapter = MagentoAdapter(
        base_url="https://supermercadosnacional.com",
        provider_id="p-nacional",
        market_id="DO",
        query="arroz",
        http_post=fake_post,
    )
    entries = list(adapter.fetch())
    assert len(entries) == 1
    assert entries[0].external_id == "2140283"

    url, payload, headers = calls[0]
    assert url == "https://supermercadosnacional.com/graphql"
    assert payload["variables"] == {"search": "arroz", "pageSize": 50, "currentPage": 1}
    assert "Store" not in headers  # sin store_code → store view default


def test_fetch_walks_all_pages() -> None:
    pages_requested: list[int] = []

    def fake_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        page = payload["variables"]["currentPage"]
        pages_requested.append(page)
        return {
            "data": {
                "products": {
                    "total_count": 3,
                    "page_info": {"total_pages": 3},
                    "items": [NACIONAL_ITEM],
                }
            }
        }

    adapter = MagentoAdapter(
        base_url="https://x.com", provider_id="p", market_id="DO", query="arroz",
        http_post=fake_post,
    )
    assert len(list(adapter.fetch())) == 3
    assert pages_requested == [1, 2, 3]


def test_fetch_sends_store_header_for_store_view() -> None:
    # hallazgo doc 09 ronda 3: `Store: jumbo` en jumbo.com.do → catálogo/precios de Jumbo
    seen_headers: list[dict[str, str]] = []

    def fake_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        seen_headers.append(headers)
        return {"data": {"products": {"total_count": 0, "page_info": {"total_pages": 0}, "items": []}}}

    adapter = MagentoAdapter(
        base_url="https://jumbo.com.do", provider_id="p-jumbo", market_id="DO",
        query="arroz", store_code="jumbo", http_post=fake_post,
    )
    assert list(adapter.fetch()) == []
    assert seen_headers[0]["Store"] == "jumbo"


def test_fetch_skips_items_without_price() -> None:
    broken = {**NACIONAL_ITEM, "sku": "999", "price_range": {"minimum_price": {"final_price": {"value": None}}}}

    def fake_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        return {
            "data": {
                "products": {
                    "total_count": 2,
                    "page_info": {"total_pages": 1},
                    "items": [broken, NACIONAL_ITEM],
                }
            }
        }

    adapter = MagentoAdapter(
        base_url="https://x.com", provider_id="p", market_id="DO", query="arroz",
        http_post=fake_post,
    )
    entries = list(adapter.fetch())
    assert [e.external_id for e in entries] == ["2140283"]  # el roto se salta, no rompe la corrida


# ── Cap de resultados: la búsqueda de Magento es difusa (OR de tokens) ────────────────────────
# Medido en vivo contra Jumbo (2026-07-15): "habichuelas rojas la famosa" → 704 productos, de los
# cuales 2 son relevantes; a partir del puesto 3 aparecen AMBIENTADORES (matchean por "rojos").
# Magento hace OR de los tokens → cuantas más palabras, más basura. Nos traíamos las 704, las
# embebíamos con BGE-M3 y las mandábamos a la cola humana: 1502 productos de Jumbo en una corrida.
#
# El cap sale de DATOS, no de intuición. Posición del ÚLTIMO relevante en 6 términos medidos:
#   arroz la garza 7 · habichuelas rojas la famosa 2 · aceite mazola 7
#   arroz integral 8 · leche evaporada 15 · azucar crema 12   ← y sus posiciones NO son contiguas
# top-10 habría perdido 5 de "leche evaporada" y 1 de "azucar crema". top-20 conserva el 100%.


def _paged_post(total_pages: int, per_page: int):  # type: ignore[no-untyped-def]
    calls: list[int] = []

    def fake_post(url: str, payload: dict, headers: dict[str, str]) -> dict:
        page = payload["variables"]["currentPage"]
        calls.append(page)
        items = [dict(NACIONAL_ITEM, sku=f"sku-{page}-{i}") for i in range(per_page)]
        return {
            "data": {
                "products": {
                    "total_count": total_pages * per_page,
                    "page_info": {"total_pages": total_pages},
                    "items": items,
                }
            }
        }

    return fake_post, calls


def test_fetch_stops_at_the_result_cap_instead_of_draining_the_fuzzy_match() -> None:
    fake_post, calls = _paged_post(total_pages=15, per_page=50)  # 750 productos disponibles
    adapter = MagentoAdapter(
        base_url="https://x.test", provider_id="p", market_id="DO",
        query="habichuelas rojas la famosa", http_post=fake_post,
    )

    entries = list(adapter.fetch())

    assert len(entries) == MAGENTO_MAX_RESULTS, "corta en el cap, no drena las 15 páginas"
    assert calls == [1], "una sola request: el cap cabe en la primera página"


def test_fetch_returns_everything_when_the_store_has_less_than_the_cap() -> None:
    # Sin ruido que cortar, el cap no molesta: se traen todos.
    fake_post, calls = _paged_post(total_pages=1, per_page=3)
    adapter = MagentoAdapter(
        base_url="https://x.test", provider_id="p", market_id="DO", query="arroz", http_post=fake_post
    )

    assert len(list(adapter.fetch())) == 3

"""Unit — `ProductDetailSource` por plataforma (F3.2a, camino A): re-fetch de UN producto por id.

VTEX por `productId` (`fq=productId:`), Magento por `sku` (filter GraphQL). Reusan los mapeos de
ingesta (`map_vtex_product`/`map_magento_product`). Devuelven None si la tienda ya no lo tiene. Sin red.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.catalog_sources.magento_adapter import (
    MagentoProductDetailAdapter,
)
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexProductDetailAdapter


def _vtex_item() -> dict:
    return {
        "productId": "12345",
        "productName": "Arroz La Garza 20 Lb",
        "brand": "La Garza",
        "link": "https://sirena.do/arroz/p",
        "categories": ["/Despensa/Arroz/"],
        "items": [
            {
                "ean": "7460083780023",
                "images": [{"imageUrl": "http://img/1.jpg"}],
                "sellers": [{"commertialOffer": {"Price": 124}}],
            }
        ],
    }


def test_vtex_detail_fetches_by_product_id() -> None:
    captured: dict[str, str] = {}

    def http_get(url: str) -> list[dict]:
        captured["url"] = url
        return [_vtex_item()]

    adapter = VtexProductDetailAdapter("https://sirena.do", "p1", "DO", http_get=http_get)
    entry = adapter.fetch_by_external_id("12345", "https://sirena.do/arroz/p")

    assert "fq=productId:12345" in captured["url"]
    assert entry is not None
    assert entry.external_id == "12345"
    assert entry.ean == "7460083780023"
    assert entry.price.amount_minor == 12400  # 124.00 DOP en unidades menores


def test_vtex_detail_returns_none_when_not_found() -> None:
    adapter = VtexProductDetailAdapter("https://sirena.do", "p1", "DO", http_get=lambda u: [])
    assert adapter.fetch_by_external_id("999", None) is None


def _magento_resp() -> dict:
    return {
        "data": {
            "products": {
                "items": [
                    {
                        "name": "Arroz Selecto 5 Lb",
                        "sku": "SKU-1",
                        "url_key": "arroz-selecto",
                        "price_range": {"minimum_price": {"final_price": {"value": 130, "currency": "DOP"}}},
                        "small_image": {"url": "http://img/2.jpg"},
                        "categories": [{"name": "Arroz", "level": 2}],
                    }
                ]
            }
        }
    }


def test_magento_detail_fetches_by_sku() -> None:
    captured: dict[str, object] = {}

    def http_post(url: str, payload: dict, headers: dict) -> dict:
        captured["variables"] = payload["variables"]
        return _magento_resp()

    adapter = MagentoProductDetailAdapter("https://nacional.com", "p1", "DO", http_post=http_post)
    entry = adapter.fetch_by_external_id("SKU-1", None)

    assert captured["variables"]["sku"] == "SKU-1"
    assert entry is not None
    assert entry.external_id == "SKU-1"
    assert entry.price.amount_minor == 13000


def test_magento_detail_returns_none_when_empty() -> None:
    adapter = MagentoProductDetailAdapter(
        "https://nacional.com", "p1", "DO",
        http_post=lambda u, p, h: {"data": {"products": {"items": []}}},
    )
    assert adapter.fetch_by_external_id("x", None) is None

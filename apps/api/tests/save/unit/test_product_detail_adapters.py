"""Unit — `ProductDetailSource` por plataforma (F3.2a, camino A): re-fetch de UN producto por id.

VTEX por `productId` (`fq=productId:`), Magento por `sku` (filter GraphQL). Reusan los mapeos de
ingesta (`map_vtex_product`/`map_magento_product`). Devuelven None si la tienda ya no lo tiene. Sin red.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.fetch_outcome import DetailUnavailable
from src.contexts.save.infrastructure.catalog_sources.bravova_profile import BRAVOVA_PROFILE
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import (
    MagentoProductDetailAdapter,
)
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import (
    RestCatalogDetailAdapter,
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
    assert entry.ean == "07460083780023"  # normalizado a GTIN-14 (R6, 2026-07-16)
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


# --- REST_CATALOG (Bravo /get): detalle por source_ref.id_articulo (§15.4) ----------------------

def _bravo_article() -> dict:
    return {
        "idArticulo": 29866,
        "idexternoArticulo": "13290",
        "nombreArticulo": "AZUCAR CREMA",
        "associatedPvp": 124,
        "familiaArticulo": "GR",
        "subfamiliaArticulo": "GR-003",
        "associatedEan": [],
    }


def test_rest_detail_fetches_by_source_ref_id_articulo() -> None:
    seen: dict[str, str] = {}

    def http_get(url: str) -> dict:
        seen["url"] = url
        return {"data": _bravo_article()}  # /get devuelve UN artículo bajo "data"

    adapter = RestCatalogDetailAdapter(
        "https://bravova-api.superbravo.com.do", "p-bravo", "DO", BRAVOVA_PROFILE, http_get=http_get
    )
    entry = adapter.fetch_by_external_id("13290", None, {"id_articulo": "29866"})

    assert "idArticulo=29866" in seen["url"]  # usa el localizador de detalle, no el external_id
    assert entry is not None
    assert entry.external_id == "13290"        # el external_id sigue siendo el idexterno
    assert entry.price.amount_minor == 12400


def test_rest_detail_raises_detail_unavailable_without_locator() -> None:
    # Sin source_ref (id_articulo) → NO se puede A → DetailUnavailable (→ fallback browse, no unavailable).
    adapter = RestCatalogDetailAdapter(
        "https://bravova-api", "p-bravo", "DO", BRAVOVA_PROFILE, http_get=lambda u: {}
    )
    with pytest.raises(DetailUnavailable):
        adapter.fetch_by_external_id("13290", None, None)


def test_rest_detail_none_when_article_gone() -> None:
    adapter = RestCatalogDetailAdapter(
        "https://bravova-api", "p-bravo", "DO", BRAVOVA_PROFILE, http_get=lambda u: {"data": None}
    )
    assert adapter.fetch_by_external_id("13290", None, {"id_articulo": "29866"}) is None

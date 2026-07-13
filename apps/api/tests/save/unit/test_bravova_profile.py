"""Unit — profile de Bravo Va (Superbravo): mapea el JSON REAL de su API pública → RawCatalogEntry,
y compone con el `RestCatalogAdapter` genérico.

Sin red: el mapeo es una función pura testeada contra el payload real (capturado con Proxyman,
`docs/pending/save-ingesta-cobertura-cadenas.md`). Bravo Va es el PRIMER profile del adapter genérico;
un súper nuevo con API REST propia entra agregando otro profile, sin tocar el adapter. Precio vía
Money.from_major (sin float, §12·B); moneda derivada del `market_id`.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.contexts.save.infrastructure.catalog_sources.bravova_profile import (
    BRAVOVA_PROFILE,
    map_bravova_item,
)
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import RestCatalogAdapter
from src.shared.money import Currency, Money

# item real (recortado) de
# https://bravova-api.superbravo.com.do/public/articulo/list?model.filterByIdSeccion=3&...
BRAVOVA_ITEM = {
    "idArticulo": 29866,
    "idexternoArticulo": "13290",
    "nombreArticulo": "AZUCAR CREMA",
    "familiaArticulo": "GR",
    "subfamiliaArticulo": "GR-003",
    "impuestoArticulo": 16.000,
    "nimgArticulo": 2,
    "imageCatalogVersion": "94",
    "associatedTienda": [
        {
            "idTiendaArticuloTienda": 1000,
            "pvpArticuloTienda": 124.000,
            "disponibleArticuloTienda": True,
            "stockArticuloTienda": 5396.000,
            "associatedOferta": [],
        }
    ],
    "associatedEan": [],
    "associatedPvp": 124.000,
    "originalPvp": 124.000,
}
DOP = Currency("DOP")


def test_map_bravova_item_full_fields() -> None:
    entry = map_bravova_item(BRAVOVA_ITEM, provider_id="p-bravo", market_id="DO")
    assert entry == RawCatalogEntry(
        provider_id="p-bravo",
        market_id="DO",
        external_id="13290",  # idexternoArticulo (SKU estable), no el id interno
        name="AZUCAR CREMA",
        brand="",  # Bravo Va no expone marca → la resuelve el matching
        size_text="",  # "AZUCAR CREMA" no trae tamaño
        price=Money(12400, DOP),  # 124.00 → minor units, sin float
        price_type=PriceType.ONLINE,
        source="bravova",
        category_path=("GR", "GR-003"),  # taxonomía cruda de la tienda (familia/subfamilia)
        ean=None,  # associatedEan vacío
        url=None,
        image_url="https://bravova-resources.superbravo.com.do/images/catalogo/big/13290_1.png?v=94",
        source_ref={"id_articulo": "29866"},  # §15.3: idArticulo interno para el /get de frescura
    )


def test_map_sets_source_ref_from_id_articulo() -> None:
    # El external_id es idexterno (13290); el localizador de detalle (para /get) es idArticulo (29866).
    entry = map_bravova_item(BRAVOVA_ITEM, provider_id="p-bravo", market_id="DO")
    assert entry.external_id == "13290"
    assert entry.source_ref == {"id_articulo": "29866"}


def test_map_derives_currency_from_market_multicountry() -> None:
    entry = map_bravova_item(BRAVOVA_ITEM, provider_id="p-x", market_id="US")
    assert entry.price == Money(12400, Currency("USD"))
    assert entry.market_id == "US"


def test_map_extracts_size_from_name() -> None:
    item = {**BRAVOVA_ITEM, "nombreArticulo": "SANTO DOMINGO CAFE 1 LB"}
    entry = map_bravova_item(item, provider_id="p-bravo", market_id="DO")
    assert entry.size_text == "1 LB"


def test_map_uses_effective_price_not_original() -> None:
    # con oferta activa: associatedPvp es el precio efectivo (99), originalPvp el previo (129)
    item = {**BRAVOVA_ITEM, "associatedPvp": 99.000, "originalPvp": 129.000}
    entry = map_bravova_item(item, provider_id="p-bravo", market_id="DO")
    assert entry.price == Money(9900, DOP)


def test_map_raises_without_price() -> None:
    broken = {k: v for k, v in BRAVOVA_ITEM.items() if k != "associatedPvp"}
    broken["associatedTienda"] = [{"idTiendaArticuloTienda": 1000}]
    with pytest.raises(ValueError):
        map_bravova_item(broken, provider_id="p-bravo", market_id="DO")


def test_profile_composes_with_generic_adapter() -> None:
    """El profile de Bravo + el adapter genérico ingieren el envelope real {"data":{"list","totalCount"}}."""

    def fake_get(url: str) -> dict:
        if "model.filterByIdSeccion=3" in url and "paginationOffset=0" in url:
            return {"data": {"totalCount": 1, "list": [BRAVOVA_ITEM]}}
        return {"data": {"totalCount": 0, "list": []}}

    adapter = RestCatalogAdapter(
        base_url="https://bravova-api.superbravo.com.do",
        provider_id="p-bravo",
        market_id="DO",
        profile=BRAVOVA_PROFILE,
        sections=["3"],
        store_id="1000",
        http_get=fake_get,
    )
    entries = list(adapter.fetch())

    assert len(entries) == 1
    assert entries[0].external_id == "13290"
    assert entries[0].source == "bravova"

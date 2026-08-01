"""Unit — REGRESIÓN: el dry-run reventaba con 500 cuando la tienda no publica marca.

`RawCatalogEntry.brand` pasó de `str` a `str | None` para distinguir "no sé la marca" de "la marca
es vacía" (Magento y Bravo NO la exponen). Pero `SampleEntryDto.brand` se quedó en `str`, así que
en cuanto un adapter devolvía `None` Pydantic reventaba AL SERIALIZAR y el endpoint respondía
**500 Internal Server Error** — visto en vivo en `POST /admin/save/basket-queries/preview`.

Ningún test lo cazó porque todos los payloads de prueba del preview traen marca. Este cubre el
caso que la producción sí tiene: Nacional y Bravo, que son 2 de las 3 tiendas.

Afecta a los DOS endpoints que proyectan `SampleEntryDto`: el preview de la canasta y el test de
una fuente.
"""
from __future__ import annotations

from src.api.v1.controllers.admin_save import SampleEntryDto
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money


def _entry(brand: str | None) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p1",
        market_id="DO",
        external_id="sku-1",
        name="Habichuelas Pintas 15 Oz",
        brand=brand,
        size_text="15 Oz",
        price=Money(9500, Currency("DOP")),
        price_type=PriceType.ONLINE,
        source="magento",
    )


def _project(entry: RawCatalogEntry) -> SampleEntryDto:
    """La MISMA proyección que hace el controller en `preview_basket_query`/`test_source`."""
    return SampleEntryDto(
        external_id=entry.external_id,
        name=entry.name,
        brand=entry.brand,
        price_minor=entry.price.amount_minor,
        currency=str(entry.price.currency),
        ean=entry.ean,
        url=entry.url,
        image_url=entry.primary_image_url,
    )


def test_una_tienda_que_no_publica_marca_no_tumba_el_dry_run() -> None:
    dto = _project(_entry(None))

    assert dto.brand is None  # "no la sé", no una cadena inventada
    assert dto.name == "Habichuelas Pintas 15 Oz"


def test_una_tienda_que_si_la_publica_la_conserva() -> None:
    assert _project(_entry("LA FAMOSA")).brand == "LA FAMOSA"

"""Profile de Bravo Va (Superbravo) para el `RestCatalogAdapter` genérico — el PRIMER súper con API
REST propia integrado por esta vía.

API pública: `GET {base}/public/articulo/list?model.filterByIdSeccion=..&model.filterByIdTienda=..&
paginationMaxItems=..&paginationOffset=..` → `{"data": {"list": [...], "totalCount": N}}`. Precio vía
`Money.from_major` (sin float, §12·B) desde `associatedPvp` (el precio EFECTIVO; `originalPvp` es el
previo al descuento). Moneda derivada del `market_id`. Bravo Va no expone marca ni (por ahora) EAN —
el matching los resuelve; `familiaArticulo`/`subfamiliaArticulo` son su taxonomía cruda.

Sumar otro súper con API propia = otro módulo `*_profile.py` como este, sin tocar el adapter.
"""
from __future__ import annotations

from src.shared.money import Currency, Money, primary_currency_for_market

from ...domain.entities import PriceType
from ...domain.ports import RawCatalogEntry
from .rest_catalog_adapter import CatalogProfile
from .size_from_name import extract_size

_SOURCE = "bravova"


def _price_major(item: dict) -> float | int | str:
    price = item.get("associatedPvp")
    if price is not None:
        return price
    for tienda in item.get("associatedTienda", []):
        pvp = tienda.get("pvpArticuloTienda")
        if pvp is not None:
            return pvp
    raise ValueError(f"Artículo Bravo Va sin precio: {item.get('idexternoArticulo')!r}")


def _category_path(item: dict) -> tuple[str, ...]:
    return tuple(
        code
        for code in (item.get("familiaArticulo"), item.get("subfamiliaArticulo"))
        if code and str(code).strip()
    )


def _first_ean(item: dict) -> str | None:
    # `associatedEan` viene vacío en el catálogo probado; cuando trae valor, su shape exacto está
    # sin verificar → solo se acepta un string plano, cualquier otra forma se ignora.
    for ean in item.get("associatedEan", []):
        if isinstance(ean, str) and ean.strip():
            return ean
    return None


def map_bravova_item(item: dict, provider_id: str, market_id: str) -> RawCatalogEntry:
    """Mapea un artículo del JSON de Bravo Va a `RawCatalogEntry`. Levanta ValueError si no hay precio."""
    currency = Currency(primary_currency_for_market(market_id))
    price = Money.from_major(str(_price_major(item)), currency)
    name = item.get("nombreArticulo", "")

    # §15.3: el `/get` de Bravo usa `idArticulo` (interno), NO el `idexternoArticulo` que es el
    # external_id → se guarda como localizador de detalle para el re-fetch de frescura (camino A).
    id_articulo = item.get("idArticulo")
    source_ref = {"id_articulo": str(id_articulo)} if id_articulo is not None else None

    return RawCatalogEntry(
        provider_id=provider_id,
        market_id=market_id,
        external_id=str(item.get("idexternoArticulo", "")),
        name=name,
        brand="",
        size_text=extract_size(name),
        price=price,
        price_type=PriceType.ONLINE,
        source=_SOURCE,
        category_path=_category_path(item),
        ean=_first_ean(item),
        url=None,
        image_url=None,
        source_ref=source_ref,
    )


BRAVOVA_PROFILE = CatalogProfile(
    resource_path="/public/articulo/list",
    section_param="model.filterByIdSeccion",
    store_param="model.filterByIdTienda",
    page_size_param="paginationMaxItems",
    offset_param="paginationOffset",
    list_path=("data", "list"),
    total_path=("data", "totalCount"),
    map_item=map_bravova_item,
    page_size=30,
    # Bravo Va RECHAZA el request sin `showOrder` ({"errors":[{"code":"required","field":"showOrder"}]})
    extra_params=(("showOrder", "importerankingArticulo asc"),),
)

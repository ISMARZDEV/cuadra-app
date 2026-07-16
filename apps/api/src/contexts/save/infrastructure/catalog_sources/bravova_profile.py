"""Profile de Bravo Va (Superbravo) para el `RestCatalogAdapter` genérico — el PRIMER súper con API
REST propia integrado por esta vía.

API pública: `GET {base}/public/articulo/list?model.filterByIdSeccion=..&model.filterByIdTienda=..&
paginationMaxItems=..&paginationOffset=..` → `{"data": {"list": [...], "totalCount": N}}`. Precio vía
`Money.from_major` (sin float, §12·B) desde `associatedPvp` (el precio EFECTIVO; `originalPvp` es el
previo al descuento). Moneda derivada del `market_id`. `familiaArticulo`/`subfamiliaArticulo` son su
taxonomía cruda.

**EAN — corregido 2026-07-15 (el docstring anterior decía "Bravo Va no expone marca ni EAN"):**
eso vale para `articulo/list` (su campo `associatedEan` viene SIEMPRE vacío: 0/200 verificado), pero
NO para el detalle `articulo/get`, que sí trae `associatedEan` poblado (y `marcaArticulo`). Además
`list` acepta `model.filterByEan` → lookup EXACTO y GLOBAL por barcode (sin filtro de sección).
Medición sobre 100 artículos: **30% tiene un EAN GLOBAL** usable cross-tienda (prefijo 746 = Rep.
Dominicana); el resto son códigos INTERNOS 2x ("restricted distribution": peso variable, solo válidos
dentro de Bravo) o PLU cortos. Por eso el EAN de Bravo NUNCA se toma crudo — ver el filtro de §15.5.

Sumar otro súper con API propia = otro módulo `*_profile.py` como este, sin tocar el adapter.
"""
from __future__ import annotations

from src.contexts.save.domain.value_objects import pick_global_ean
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


# CDN de imágenes de Bravo (SRD `bravo-images.ts:34-39`): `{base}/{idexterno}_{n}.png?v={version}`.
# `imageCatalogVersion` = versión (cache-bust), `nimgArticulo` = nº de imágenes. Tomamos la primera.
_IMAGE_BASE = "https://bravova-resources.superbravo.com.do/images/catalogo/big"


def _image_url(item: dict) -> str | None:
    idext = item.get("idexternoArticulo")
    version = item.get("imageCatalogVersion")
    nimg = item.get("nimgArticulo") or 0
    if idext and version is not None and nimg:
        return f"{_IMAGE_BASE}/{idext}_1.png?v={version}"
    return None


def _global_ean(item: dict) -> str | None:
    """El EAN GLOBAL del artículo (§15.5), o `None` si no tiene uno confiable.

    Shape VERIFICADA en vivo (2026-07-15, `articulo/get`): `associatedEan` es una LISTA de
    `{"idEan": "...", "idArticuloEan": N}`. Antes se la daba por "sin verificar" y solo se aceptaban
    strings planos — o sea, nunca disparaba; esa cautela es la que evitó que se colara basura.

    La lista MEZCLA tres tipos y el global NO viene primero, así que `[0]` no sirve: hay globales
    (746 = Rep. Dominicana), internos 2x (peso variable, solo válidos dentro de Bravo) y PLU cortos.
    `pick_global_ean` filtra por checksum GS1 y descarta el rango interno. `None` en ~70% de los
    casos es el resultado ESPERADO: sin barcode confiable, la cascada sigue por nombre/vector.

    Se sigue tolerando el string plano por si otro profile REST reusa esta forma.
    """
    codes: list[object] = []
    for entry in item.get("associatedEan") or []:
        codes.append(entry.get("idEan") if isinstance(entry, dict) else entry)
    return pick_global_ean(codes)


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
        ean=_global_ean(item),
        url=None,
        image_url=_image_url(item),
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
    # Headers de la app iOS de Bravo (SRD `getBravoHeaders` http-client.ts:427-438). Su `/get`
    # está gateado por el token (X-Auth-Token, en `auth`) Y por este User-Agent → token-only = 403.
    # Son estructurales/no-secretos → viven aquí, no en el admin (que solo lleva el token).
    default_headers=(
        ("Accept", "*/*"),
        ("Accept-Encoding", "gzip, deflate, br"),
        ("Accept-Language", "en-US"),
        ("User-Agent", "Domicilio/122130 CFNetwork/3826.500.131 Darwin/24.5.0"),
    ),
    # §15.4 — detalle por artículo (camino A de frescura): GET /public/articulo/get?idArticulo=<id>
    # (requiere X-Auth-Token, que vive en store_registry.auth). El id es `idArticulo` (interno), que se
    # guardó como source_ref.id_articulo; el `/get` devuelve el artículo bajo "data" (misma forma de item).
    detail_path="/public/articulo/get",
    detail_param="idArticulo",
    detail_ref_key="id_articulo",
    detail_item_path=("data",),
    # Bravo NO busca por texto pero SÍ por barcode (sondeo en vivo 2026-07-15): `filterByEan` devuelve
    # el artículo exacto y funciona SIN `filterByIdSeccion` → lookup GLOBAL en una request. Habilita
    # Loop B dirigido (F3.1) y el recovery determinista (F3.2b) sobre una fuente "browse-only".
    ean_param="model.filterByEan",
)

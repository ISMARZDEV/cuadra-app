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
from .bravova_sections import section_for_subfamily
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


def _category_path(item: dict, section_label: str) -> tuple[str, ...]:
    """Categoría de ORIGEN. Prefiere el NOMBRE de la sección; los códigos son el último recurso.

    Corregido 2026-08-01. Devolvía `(familiaArticulo, subfamiliaArticulo)` = `('FV', 'FV-005')`:
    códigos internos que no significan nada fuera de Bravo. Medido sobre la cola real, eso dejaba a
    **235 productos (33% de lo no clasificado) SIN ninguna señal de origen** — el clasificador cruza
    origen contra nombre, y de Bravo el origen no aportaba nada. `RABANO ROJO LB` llegaba con
    `FV > FV-005` y terminaba en «sin señal suficiente».

    Sondeado en vivo: Bravo publica `GET /public/seccion/list` con `nombreSeccion` legible
    («Frutas y vegetales», «Víveres», «Lácteos»), y el adapter YA navega por sección, así que
    conoce la de cada artículo sin pagar una request extra. El nombre entra por `section_label`.

    Los códigos se CONSERVAN como fallback (búsqueda por EAN y por texto son globales: ahí no hay
    sección, y algo de señal es mejor que ninguna). Van DESPUÉS del nombre a propósito:
    `lexicon_match_path` recorre los segmentos del más hondo al más general, o sea que prueba el
    código primero y cae al nombre — y el código nunca pega nada, así que el orden no le quita
    oportunidades al nombre.

    Al final va `metatagArticulo`: la palabra clave que Bravo ya normalizó para su buscador
    (`COCA COLA 400 ML`→`refrescos`, `MUBRAVO QUESO DE FREIR`→`queso`). Último en la tupla = PRIMERO
    en el recorrido, porque es lo más específico que manda la tienda: la sección dice «Lácteos» y el
    metatag dice `queso`. Medido sobre 1025 artículos: presente en el 35%, **+63 productos que
    empiezan a resolver, 0 que dejan de resolver**, 3 que cambian de hoja.

    Costo conocido de esos 3: el metatag le gana a la sección cuando discrepan. Acierta en uno
    (`ARO VAINILLA Y PASAS`: Galletas→Bizcochos) y falla en otro (`BRAVO CLAVO DULCE`:
    Especias→Dulces Típicos, porque su metatag es `dulce` y el clavo dulce es una especia). 0.3% de
    los casos contra un saldo de +63/−0 — se asume, y el juez de la banda gris sigue arbitrando.

    Cuando NO hay `section_label` —que es el caso del camino de CANASTA, el único que corre hoy—
    la sección se resuelve por el MAPA `subfamilia → sección` (`bravova_sections.py`, derivado
    navegando el catálogo). `/public/articulo/search` trae `subfamiliaArticulo` en el **100%** de
    sus resultados, así que el mapa cubre justo el camino donde el `section_label` no llega, y sin
    pagar una request extra. Una subfamilia ambigua o nueva no está en el mapa y no aporta nada:
    ante duda no se inventa, el producto cae al nombre/vector/juez.

    Precedencia: `section_label` (EXACTO, lo dice el browse) > mapa (derivado) > sólo códigos.
    """
    subfamily = str(item.get("subfamiliaArticulo") or "").strip()
    codes = tuple(
        str(code).strip()
        for code in (item.get("familiaArticulo"), subfamily)
        if code and str(code).strip()
    )
    metatag = str(item.get("metatagArticulo") or "").strip()
    tail = (metatag,) if metatag else ()

    section = section_label.strip() or (section_for_subfamily(subfamily) or "")
    if section:
        return (section, *codes, *tail)
    return (*codes, *tail)


# CDN de imágenes de Bravo (SRD `bravo-images.ts:34-39`): `{base}/{idexterno}_{n}.png?v={version}`.
# `imageCatalogVersion` = versión (cache-bust), `nimgArticulo` = nº de imágenes. Tomamos la primera.
_IMAGE_BASE = "https://bravova-resources.superbravo.com.do/images/catalogo/big"


# Tope de imágenes por artículo. `nimgArticulo` viene del proveedor: un valor disparatado
# generaría cientos de URLs INVENTADAS que además nadie verificó que existan.
_MAX_IMAGES = 10


def _image_urls(item: dict) -> tuple[str, ...]:
    """TODAS las imágenes del artículo (F5). Bravo no manda URLs: manda `nimgArticulo` (CUÁNTAS
    hay) y el patrón lleva índice (`{idext}_N.png`). Teníamos el patrón completo y usábamos sólo
    la primera."""
    idext = item.get("idexternoArticulo")
    version = item.get("imageCatalogVersion")
    nimg = item.get("nimgArticulo") or 0
    if not (idext and version is not None and nimg):
        return ()
    count = min(int(nimg), _MAX_IMAGES)
    return tuple(f"{_IMAGE_BASE}/{idext}_{i}.png?v={version}" for i in range(1, count + 1))


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


def map_bravova_item(
    item: dict, provider_id: str, market_id: str, section_label: str = ""
) -> RawCatalogEntry:
    """Mapea un artículo del JSON de Bravo Va a `RawCatalogEntry`. Levanta ValueError si no hay precio.

    `section_label` es el nombre legible de la sección que se está navegando; llega vacío en los
    caminos que no navegan (lookup por EAN, búsqueda por texto, detalle). Ver `_category_path`.
    """
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
        # Bravo NO expone marca. Tiene un `marcaArticulo` en el detalle, pero medido en vivo
        # (2026-07-30, 25 artículos) son 4 códigos internos —"01"/"03"/"04"— que agrupan por TIPO
        # de producto, no por marca: "01" lo comparten BRAVO y LA ANTORCHA, "04" son los frescos.
        # Tomarlo como marca sería inventar catálogo. `None` (no `""`) para no pisar lo ya conocido.
        brand=None,
        size_text=extract_size(name),
        price=price,
        price_type=PriceType.ONLINE,
        source=_SOURCE,
        category_path=_category_path(item, section_label),
        ean=_global_ean(item),
        url=None,
        image_urls=_image_urls(item),
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
    # Bravo busca por barcode (sondeo en vivo 2026-07-15): `filterByEan` devuelve el artículo exacto y
    # funciona SIN `filterByIdSeccion` → lookup GLOBAL en una request. Habilita Loop B dirigido (F3.1)
    # y el recovery determinista (F3.2b) sobre una fuente "browse-only".
    # CATÁLOGO DE SECCIONES (sondeado en vivo 2026-08-01): traduce el id de sección a nombre legible
    # («Frutas y vegetales», «Víveres», «Lácteos»), que es lo que el clasificador puede leer. 50
    # secciones, 41 son las que iteramos. Gotchas verificados contra el API real:
    #   · exige `showOrder` como el browse, pero con OTRO valor (`ordenSeccion asc`) → params propios;
    #   · `paginationMaxItems=200` da `typeMismatch`; 100 sí funciona y alcanza para las 50.
    section_catalog_path="/public/seccion/list",
    section_catalog_list_path=("data", "list"),
    section_id_key="idSeccion",
    section_name_key="nombreSeccion",
    section_catalog_params=(
        ("paginationMaxItems", "100"),
        ("paginationOffset", "0"),
        ("showOrder", "ordenSeccion asc"),
    ),
    ean_param="model.filterByEan",
    # Y TAMBIÉN por texto (desbloqueo 2026-07-16): el `showOrder` que faltaba era `score`. Endpoint
    # DISTINTO del browse (`/public/articulo/search`, no `/list`) y con su propio `showOrder` (el
    # `importerankingArticulo asc` del browse es rechazado por `/search`). Verificado en vivo:
    # `?model.nombreArticulo=arroz&showOrder=score` devuelve productos COMPLETOS (misma shape que
    # `/list`, `associatedEan` vacío → el EAN sigue viniendo del detalle, §15.5). Con esto Bravo pasa
    # a cubrir por NOMBRE los canónicos sin EAN (los nacidos de Magento), antes invisibles para Loop B.
    text_param="model.nombreArticulo",
    search_path="/public/articulo/search",
    search_extra_params=(("showOrder", "score"),),
    text_max_results=20,  # top-N por score (search hace OR de tokens; el cap evita el ruido, como Magento)
)

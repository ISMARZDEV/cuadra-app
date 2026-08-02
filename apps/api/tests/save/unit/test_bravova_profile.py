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
        # `None` = NO la expone (≠ exponerla vacía): su `marcaArticulo` son códigos internos por
        # tipo de producto. `""` pisaría en cada corrida la marca resuelta por otra vía.
        brand=None,
        size_text="",  # "AZUCAR CREMA" no trae tamaño
        price=Money(12400, DOP),  # 124.00 → minor units, sin float
        price_type=PriceType.ONLINE,
        source="bravova",
        # El nombre de sección lo resuelve el MAPA `subfamilia → sección` (`GR-003` → «Granos»),
        # porque el camino de canasta no manda `section_label`. Los códigos crudos se conservan
        # detrás como fallback.
        category_path=("Granos", "GR", "GR-003"),
        ean=None,  # associatedEan vacío
        url=None,
        #  → Bravo declara DOS imágenes y la URL lleva índice; antes se
        # construía sólo la _1 y la segunda se perdía.
        image_urls=(
            "https://bravova-resources.superbravo.com.do/images/catalogo/big/13290_1.png?v=94",
            "https://bravova-resources.superbravo.com.do/images/catalogo/big/13290_2.png?v=94",
        ),
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


def test_profile_declares_the_ean_lookup_param() -> None:
    """Bravo SÍ sabe buscar por barcode, aunque NO sepa buscar por texto.

    Sondeo en vivo 2026-07-15 contra su API real: 12 params de búsqueda por texto
    (`filterByDescripcion`, `filterByNombre`, `search`, `q`…) fueron IGNORADOS —el `totalCount` no se
    movía de 94—, pero `model.filterByEan=7466555500137` devolvió `totalCount=1` con el artículo
    exacto, y también SIN filtro de sección (lookup global).

    Declararlo acá es lo que habilita Loop B dirigido (F3.1) y el recovery determinista (F3.2b) para
    Bravo — algo que SupermercadosRD no tiene (su `RecoverableShopId` es 1|2|3|4; Bravo es el 6).
    """
    assert BRAVOVA_PROFILE.ean_param == "model.filterByEan"


def test_profile_declares_the_text_search_mode() -> None:
    """Bravo SÍ busca por texto — corrección del hallazgo previo (desbloqueo 2026-07-16).

    El `showOrder` que faltaba es `score` (no `importerankingArticulo asc`, que `/search` rechaza).
    Verificado en vivo: `GET /public/articulo/search?model.nombreArticulo=arroz&showOrder=score`
    devuelve productos COMPLETOS. Es un endpoint DISTINTO del browse (`/search`, no `/list`) y con
    su propio `showOrder`, por eso el profile lo declara aparte de `resource_path`/`extra_params`.
    """
    assert BRAVOVA_PROFILE.text_param == "model.nombreArticulo"
    assert BRAVOVA_PROFILE.search_path == "/public/articulo/search"
    assert ("showOrder", "score") in BRAVOVA_PROFILE.search_extra_params
    assert BRAVOVA_PROFILE.text_max_results == 20


# ── Cosecha de EAN desde el detalle (§15.5) ───────────────────────────────────────────────────
# `articulo/list` trae `associatedEan` SIEMPRE vacío (0/200 verificado); `articulo/get` lo trae
# poblado. Como AMBOS pasan por este mapper, cosechar acá hace que `price_refresh` —que ya llama a
# /get por cada producto conocido— persista el barcode SIN una sola request extra.


def test_harvests_the_global_ean_from_the_detail_payload() -> None:
    # Estructura REAL de `/get` (sondeo 2026-07-15, "LA GARZA ARROZ 10 LB"): lista mezclada, con un
    # PLU corto primero y el EAN global después.
    item = {
        "idexternoArticulo": "4536",
        "nombreArticulo": "LA GARZA ARROZ 10 LB",
        "associatedPvp": 480,
        "associatedEan": [
            {"idEan": "33334", "idArticuloEan": 4536},
            {"idEan": "7460083780146", "idArticuloEan": 4536},
        ],
    }

    entry = map_bravova_item(item, "p1", "DO")

    # Sale NORMALIZADO a GTIN-14 (2026-07-16): es la forma canónica en la que convergen las cuatro
    # escrituras posibles del mismo código, para que la etapa EAN pueda comparar strings.
    assert entry.ean == "07460083780146"


def test_never_harvests_a_store_internal_barcode() -> None:
    # Solo códigos internos 2x (peso variable) → NO hay EAN. Persistirlo alimentaría la etapa que
    # auto-enlaza sin revisión humana con un código que solo significa algo dentro de Bravo.
    item = {
        "idexternoArticulo": "31475",
        "nombreArticulo": "BRAVO HABICHUELAS YACOMELO 1 KG",
        "associatedPvp": 150,
        "associatedEan": [{"idEan": "2050001508980", "idArticuloEan": 31475}],
    }

    assert map_bravova_item(item, "p1", "DO").ean is None


def test_list_payload_without_eans_maps_to_no_ean() -> None:
    # El browse (Loop A) no trae `associatedEan` → ean None, sin romper. La cosecha llega después,
    # cuando price_refresh pida el detalle.
    item = {"idexternoArticulo": "9", "nombreArticulo": "X", "associatedPvp": 100}

    assert map_bravova_item(item, "p1", "DO").ean is None


# --- Nombre de sección como categoría de ORIGEN (2026-08-01) ----------------------------------
#
# `_category_path` devolvía sólo `(familiaArticulo, subfamiliaArticulo)` = `('FV','FV-005')`: códigos
# internos que no significan nada fuera de Bravo. Medido sobre la cola real, eso dejaba **235
# productos (33% de lo no clasificado) sin ninguna señal de origen**, porque el clasificador cruza
# ORIGEN contra NOMBRE y de Bravo el origen no aportaba nada. `RABANO ROJO LB` llegaba con
# `FV > FV-005` y moría en «sin señal suficiente».
#
# Bravo publica los nombres en `/public/seccion/list` («Frutas y vegetales», «Víveres») y el adapter
# YA navega por sección, así que los conoce sin pagar una request extra.


def test_the_section_name_leads_the_category_path() -> None:
    entry = map_bravova_item(
        {"nombreArticulo": "RABANO ROJO LB", "associatedPvp": 65,
         "familiaArticulo": "FV", "subfamiliaArticulo": "FV-005"},
        "p-bravo", "DO", "Frutas y vegetales",
    )
    # El nombre PRIMERO: `lexicon_match_path` recorre los segmentos del más hondo al más general,
    # así que los códigos se prueban antes y —al no pegar nunca— caen al nombre sin taparlo.
    assert entry.category_path == ("Frutas y vegetales", "FV", "FV-005")


def test_without_a_section_label_the_map_resolves_it() -> None:
    """El camino de CANASTA (el único que corre hoy) no navega secciones, así que nunca manda
    `section_label` — y ahí entra el mapa. Es el caso reportado por el usuario: `RABANO ROJO LB`
    llegaba como `FV > FV-005` y no aportaba señal de origen."""
    entry = map_bravova_item(
        {"nombreArticulo": "RABANO ROJO LB", "associatedPvp": 65,
         "familiaArticulo": "FV", "subfamiliaArticulo": "FV-005"},
        "p-bravo", "DO", "",
    )
    assert entry.category_path == ("Frutas y vegetales", "FV", "FV-005")


def test_an_unmapped_subfamily_keeps_only_the_raw_codes() -> None:
    """Subfamilia ambigua o nueva → NO está en el mapa → no se inventa sección. Los códigos se
    conservan (algo de señal es mejor que ninguna) y el producto cae al nombre/vector/juez."""
    entry = map_bravova_item(
        {"nombreArticulo": "PRODUCTO RARO", "associatedPvp": 10,
         "familiaArticulo": "ZZ", "subfamiliaArticulo": "ZZ-999"},
        "p-bravo", "DO", "",
    )
    assert entry.category_path == ("ZZ", "ZZ-999")


def test_the_browse_section_label_wins_over_the_map() -> None:
    """Precedencia: lo que dice el browse es EXACTO (navegó esa sección); el mapa es derivado por
    voto. Si ambos hablan, gana el exacto."""
    entry = map_bravova_item(
        {"nombreArticulo": "X", "associatedPvp": 1,
         "familiaArticulo": "FV", "subfamiliaArticulo": "FV-005"},
        "p-bravo", "DO", "Alimentación general",
    )
    assert entry.category_path[0] == "Alimentación general"


def test_a_blank_section_label_is_treated_as_absent() -> None:
    entry = map_bravova_item(
        {"nombreArticulo": "X", "associatedPvp": 1, "familiaArticulo": "GR"},
        "p-bravo", "DO", "   ",
    )
    assert entry.category_path == ("GR",)


def test_the_profile_declares_where_the_section_names_live() -> None:
    """Verificado contra el API real: exige `showOrder` con OTRO valor que el browse, y
    `paginationMaxItems=200` da `typeMismatch` (100 sí)."""
    assert BRAVOVA_PROFILE.section_catalog_path == "/public/seccion/list"
    assert BRAVOVA_PROFILE.section_id_key == "idSeccion"
    assert BRAVOVA_PROFILE.section_name_key == "nombreSeccion"
    params = dict(BRAVOVA_PROFILE.section_catalog_params)
    assert params["showOrder"] == "ordenSeccion asc"
    assert int(params["paginationMaxItems"]) <= 100


def test_the_metatag_becomes_the_most_specific_segment() -> None:
    """`metatagArticulo` es la palabra clave que Bravo ya normalizó para su buscador.

    Medido 2026-08-01 sobre 1025 artículos de TODAS las secciones: presente en el 35%, y sumarlo al
    path da **+63 productos que empiezan a resolver, 0 que dejan de resolver** y sólo 3 que cambian
    de hoja. Ganancias típicas: `DOÑA GALLINA CALDO`→Caldos & Sopas, `MUBRAVO QUESO DE FREIR`→Queso,
    `BRAVO LECHE EVAPORADA`→Leches Condensadas & Evaporadas, `EMILIOS HOT DOG`→Salchichas.

    Va ÚLTIMO en la tupla, o sea que `lexicon_match_path` lo prueba PRIMERO (recorre hondo→general).
    Es lo más específico que manda la tienda: la sección dice «Lácteos» y el metatag dice `queso`.

    COSTO CONOCIDO: en los 3 casos que cambian, el metatag y la sección discrepan y gana el metatag.
    Acierta en uno (`ARO VAINILLA Y PASAS`: Galletas → Bizcochos) y falla en otro
    (`BRAVO CLAVO DULCE`: Especias → Dulces Típicos por el metatag `dulce`; el clavo dulce es una
    especia). 3 de 1025 = 0.3%, con el saldo global +63/−0.
    """
    entry = map_bravova_item(
        {"nombreArticulo": "MUBRAVO QUESO DE FREIR LB", "associatedPvp": 250,
         "familiaArticulo": "LA", "subfamiliaArticulo": "LA-004",
         "metatagArticulo": "queso"},
        "p-bravo", "DO", "Lácteos",
    )
    assert entry.category_path == ("Lácteos", "LA", "LA-004", "queso")


def test_an_empty_metatag_adds_no_segment() -> None:
    # 65% de los artículos NO lo traen: no puede aparecer un segmento vacío que ensucie el path.
    entry = map_bravova_item(
        {"nombreArticulo": "X", "associatedPvp": 1, "familiaArticulo": "GR",
         "metatagArticulo": "   "},
        "p-bravo", "DO", "Granos",
    )
    assert entry.category_path == ("Granos", "GR")


def test_the_detail_payload_carries_its_own_section_and_it_wins() -> None:
    """`/public/articulo/get` trae la sección REAL del artículo dentro del item —
    `associatedSeccion[].associatedSeccion.nombreSeccion`— mientras que `/list` y `/search` la
    mandan vacía. Es la única fuente EXACTA que no depende de estar navegando por sección.

    Verificado en vivo 2026-08-02 sobre 90 productos: el detalle trae nombre de sección en el
    **100%** (y EAN global usable en el 66%, contra el 30% que documentaba el profile).

    Gana sobre el mapa porque el mapa es derivado por voto; y gana sobre `section_label` porque
    éste es la sección que se está NAVEGANDO, y un artículo puede vivir en varias.
    """
    item = {
        "nombreArticulo": "COCA COLA 400 ML", "associatedPvp": 45,
        "familiaArticulo": "PC", "subfamiliaArticulo": "PC-065",
        "associatedSeccion": [
            {"associatedSeccion": {"idSeccion": 1025, "nombreSeccion": "Agua y refrescos"}}
        ],
    }

    entry = map_bravova_item(item, "p-bravo", "DO", "Alimentación general")

    assert entry.category_path[0] == "Agua y refrescos"


def test_a_detail_without_section_falls_back_to_the_usual_chain() -> None:
    item = {
        "nombreArticulo": "X", "associatedPvp": 1,
        "familiaArticulo": "FV", "subfamiliaArticulo": "FV-005",
        "associatedSeccion": [],
    }

    entry = map_bravova_item(item, "p-bravo", "DO", "")
    assert entry.category_path[0] == "Frutas y vegetales"  # ← el mapa, como antes


def test_a_transversal_section_from_the_detail_is_ignored() -> None:
    """El detalle devuelve la sección PRIMARIA del artículo, que a veces es una transversal —
    «Arca» (el departamento de mascotas entero), «Alimentación general», «Vida sana»—. Esas no
    nombran ninguna categoría: son las mismas que se excluyen al construir el mapa porque un
    producto vive en la suya Y en ellas.

    Medido 2026-08-02 sobre los primeros 15 productos enriquecidos: **6 (40%)** recibieron una
    transversal del detalle. `FRESCAN POLLO Y ARROZ` pasaba de «Comida mascotas» (que el mapa
    resuelve bien por `AR-002`) a «Arca», que no pega ningún token. Lo EXACTO le estaba ganando a
    lo ÚTIL.
    """
    item = {
        "nombreArticulo": "FRESCAN POLLO Y ARROZ 1 LB", "associatedPvp": 120,
        "familiaArticulo": "AR", "subfamiliaArticulo": "AR-002",
        "associatedSeccion": [{"associatedSeccion": {"nombreSeccion": "Arca"}}],
    }

    entry = map_bravova_item(item, "p-bravo", "DO", "")

    assert entry.category_path[0] == "Comida mascotas", (
        "una sección transversal del detalle no puede tapar al mapa"
    )


def test_a_real_section_from_the_detail_still_wins() -> None:
    item = {
        "nombreArticulo": "COCA COLA 400 ML", "associatedPvp": 45,
        "familiaArticulo": "PC", "subfamiliaArticulo": "PC-065",
        "associatedSeccion": [{"associatedSeccion": {"nombreSeccion": "Agua y refrescos"}}],
    }

    assert map_bravova_item(item, "p-bravo", "DO", "").category_path[0] == "Agua y refrescos"

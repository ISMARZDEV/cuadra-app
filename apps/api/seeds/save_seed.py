"""Seed idempotente del contexto Save (§11) — canasta curada (bootstrap del matcher, doc 05).

Carga una canasta REAL: "Arroz Enriquecido La Garza 10 LB" con precios de 8 cadenas RD (tomados
del comparador SupermercadosRD, mercado DO). Matcheo MANUAL (todos apuntan al mismo canonical) →
bootstrap para el matching automático de F2. UUIDs deterministas (uuid5) + record_observation
change-only → seguro de correr N veces.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.contexts.save.domain.entities import (
    CanonicalProduct,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.domain.taxonomy import slugify
from src.contexts.save.domain.value_objects import parse_size
from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    CollectionModel,
    CollectionProductModel,
    PriceModel,
    ProviderModel,
    StoreProductModel,
    TaxonomyNodeModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
)
from src.shared.money import Currency, Money

_NS = uuid.UUID("5a5e0000-0000-4000-8000-000000000001")  # namespace fijo del seed de Save
DOP = Currency("DOP")

# cadenas RD (mercado DO) + su plataforma detectada (spikes docs 02/09)
_PROVIDERS: list[tuple[str, SourcePlatform]] = [
    ("Merca Jumbo", SourcePlatform.MAGENTO),
    ("Bravo", SourcePlatform.REST_CATALOG),  # API propia "bravova" → RestCatalogAdapter + profile
    ("Jumbo", SourcePlatform.MAGENTO),
    ("Ritmo", SourcePlatform.AGGREGATOR),
    ("Nacional", SourcePlatform.MAGENTO),
    ("Carrefour", SourcePlatform.AGGREGATOR),
    ("Plaza Lama", SourcePlatform.SPA),
    ("Sirena", SourcePlatform.VTEX),
]

# ── Fuente de extracción de Bravo Va (StoreRegistry, REST_CATALOG). Secciones (idSeccion) de su API
#    (/public/seccion/list, capturado 2026-07-06): SOLO categorías de PRODUCTO reales. EXCLUIDAS las
#    vistas promo/meta (OFERTAS 1108, PROMOCIÓN 3X2 1096, PROMOCION 2X1 1097, Productos Nuevos 1098,
#    Bodega 3X2 7, Cafetería Bravo 1095, Arca 4, CAT_ARC_017 1117): son filtros de productos que ya
#    viven en su categoría real → ingerirlas es redundante. La sobre/sub-inclusión es data-safe igual
#    (store_product va por (provider_id, external_id): un producto en 2 secciones se RE-observa, no
#    duplica). Lista ajustable desde el catálogo Apidog.
_BRAVO_SECTIONS: list[tuple[str, str]] = [
    ("3", "Alimentación general"), ("5", "Bebés"), ("8", "Cereales"), ("9", "Congelados"),
    ("11", "Embutidos"), ("12", "Especias"), ("13", "Frutas y vegetales"), ("14", "Granos"),
    ("15", "Hogar y limpieza"), ("16", "Higiene y salud"), ("17", "Lácteos"),
    ("18", "Panes y galletas"), ("19", "Víveres"), ("20", "Vida sana"), ("1016", "Pasta"),
    ("1017", "Salsa y aderezos"), ("1018", "Enlatados"), ("1019", "Comida mexicana"),
    ("1020", "Dulces y caramelos"), ("1021", "Aceitunas y encurtidos"), ("1022", "Pollo y aves"),
    ("1023", "Carnes"), ("1024", "Pescados y mariscos"), ("1025", "Agua y refrescos"),
    ("1026", "Jugos"), ("1031", "Aceites y vinagres"), ("1045", "Alimentos otras mascotas"),
    ("1046", "Higiene felinos"), ("1047", "Higiene caninos"), ("1048", "Salud y bienestar"),
    ("1049", "Pro Plan caninos"), ("1050", "Accesorios felinos y otros"),
    ("1051", "Alimentos felinos"), ("1052", "Royal Canin caninos"), ("1053", "Accesorios caninos"),
    ("1054", "Treats caninos"), ("1055", "Taste of the Wild caninos"), ("1056", "Comida mascotas"),
    ("1065", "Desechables"), ("1093", "Picaderas, Snacks, Chips"), ("1094", "Acuario"),
]

BRAVO_BASE_URL = "https://bravova-api.superbravo.com.do"
BRAVO_SOURCE_ENDPOINTS: dict = {
    "profile": "bravova",
    "sections": [sid for sid, _ in _BRAVO_SECTIONS],
    "store_id": "1000",
}

# Arroz Enriquecido La Garza 10 LB — (external_id, precio minor DOP).
# Cadenas con fuente API viva (Sirena/Nacional/Jumbo): external_id = SKU REAL verificado en vivo
# (doc 09) → `python -m seeds.save_refresh` refresca su precio desde el adapter. El resto (sin
# API aún): llave sintética "garza-10lb" + precio de SupermercadosRD como bootstrap.
_GARZA_10LB_PRICES: dict[str, tuple[str, int]] = {
    "Merca Jumbo": ("garza-10lb", 42400),  # RD$424.00 (mejor precio)
    "Bravo": ("garza-10lb", 43800),        # RD$438.00
    "Jumbo": ("2010981", 44000),           # RD$440.00 — SKU real Magento (Store: jumbo)
    "Ritmo": ("garza-10lb", 44800),        # RD$448.00
    "Nacional": ("2010981", 45495),        # RD$454.95 — SKU real Magento (mismo id CCN)
    "Carrefour": ("garza-10lb", 45995),    # RD$459.95
    "Plaza Lama": ("garza-10lb", 47400),   # RD$474.00
    "Sirena": ("14210", 47500),            # RD$475.00 — productId real VTEX
}

_ARROZ_PATH = ["Despensa & Abarrotes", "Arroz, Granos & Legumbres", "Arroz", "Arroz Blanco"]

# Taxonomía semilla completa (15 categorías tope + subcategorías, doc
# docs/research/save-fable/Categorias_y_Subcategorias.md). El árbol real se sembrará desde las
# fuentes (VTEX/Magento) en F2; esto da datos reales para la UI de categorías (Overview/Listing)
# en las 15 categorías, no solo Despensa. Sin productos bajo la mayoría (ok: la plantilla Listing
# ya maneja "sin productos"); "Arroz, Granos & Legumbres" se profundiza más abajo vía _ARROZ_PATH.
_TAXONOMY: dict[str, list[str]] = {
    "Alcohol": [
        "Brandy / Cognac", "Cerveza", "Cigarrillos", "Espumantes / Champagne", "Ginebra",
        "Hard Seltzer", "Licor", "Mamajuana", "Ron", "Sangría", "Sidra", "Tequila", "Vino",
        "Vodka", "Whisky",
    ],
    "Bebés": [
        "Accesorios De Bebé", "Alimentos Para Bebé", "Cuidado & Aseo Del Bebé",
        "Juguetes & Muebles Del Bebé", "Lavado De Ropa De Bebé", "Maternidad & Lactancia",
        "Pañales & Toallitas De Bebé",
    ],
    "Bebidas": [
        "Agua", "Bebidas Energéticas", "Bebidas En Polvo", "Bebidas Hidratantes", "Jugo",
        "Maltas", "Refresco", "Té Líquido",
    ],
    "Carnes & Pescados": [
        "Albóndigas", "Aves & Carnes Especiales", "Carnes Congeladas", "Cerdo", "Chimi",
        "Hamburguesas", "Pavo", "Pescados & Mariscos", "Pollo", "Res", "Sustituto De Carne",
    ],
    "Cuidado Del Hogar": [
        "Cocina & Comedor", "Control De Plagas", "Cuidado De Calzado", "Eléctricos Del Hogar",
        "Lavado De Ropa", "Limpieza Del Hogar", "Papel & Desechables", "Parrilla & Encendido",
    ],
    "Cuidado Personal": [
        "Accesorios De Baño", "Afeitado & Depilación", "Cuidado Capilar", "Cuidado Corporal",
        "Cuidado Facial", "Higiene Íntima", "Higiene Personal", "Maquillaje", "Repelente",
    ],
    "Despensa & Abarrotes": [
        "Aceite & Vinagre", "Arroz, Granos & Legumbres", "Café", "Caldos & Sopas",
        "Chocolate Para Beber", "Condimentos & Especias", "Desayuno & Cereal", "Endulzantes",
        "Enlatados & Conservas", "Harinas", "Pastas", "Repostería", "Salsas",
        "Semillas & Frutos Secos", "Té & Infusiones",
    ],
    "Embutidos & Delicatessen": [
        "Charcutería", "Jamón", "Longaniza", "Salami", "Salchichas",
    ],
    "Escolares & Oficina": [
        "Accesorios Escolares", "Arte & Manualidades", "Cuadernos & Agendas", "Escritura",
        "Herramientas De Oficina & Geometría", "Libros", "Papelería Escolar & Oficina",
        "Pegamentos & Cintas",
    ],
    "Frutas & Verduras": [
        "Ensaladas", "Frutas", "Frutas Deshidratadas", "Hierbas Frescas", "Pulpa De Frutas",
        "Vegetales", "Víveres",
    ],
    "Lácteos & Huevos": [
        "Crema Agria", "Huevos", "Leche", "Mantequilla & Margarina", "Queso", "Yogurt",
    ],
    "Mascotas": [
        "Accesorios Para Mascotas", "Alimento Para Gato", "Alimento Para Perro",
        "Arena Para Gato", "Higiene Para Mascotas", "Otras Mascotas",
    ],
    "Panadería & Tortillería": [
        "Bizcochos & Bizcochitos", "Discos De Masa", "Masa De Pizza", "Pan", "Tortillas",
    ],
    "Salud & Farmacia": [
        "Maternidad & Lactancia", "Medicinas", "Primeros Auxilios", "Vitaminas & Suplementos",
    ],
    "Snacks & Dulces": [
        "Chocolates & Caramelos", "Dulces Típicos", "Galletas & Barras", "Postres Listos",
        "Snacks Salados & Picaderas", "Tostadas & Snacks Horneados",
    ],
}


def provider_id(name: str) -> uuid.UUID:
    """ID determinista del provider (uuid5). Público: lo comparte el wiring de ingesta.

    Bridge de F1: en producción los providers vendrán de un `store_registry` (doc 06), no del
    seed; hasta entonces esta derivación es la única fuente de verdad de sus IDs.
    """
    return uuid.uuid5(_NS, f"provider:DO:{name}")


def _taxonomy_leaf(session: Session, market_id: str, path: list[str]) -> str:
    """Crea (idempotente) el árbol de taxonomía y devuelve el id de la HOJA."""
    parent: uuid.UUID | None = None
    accum = market_id
    node_id: uuid.UUID | None = None
    for level, name in enumerate(path):
        accum = f"{accum}/{name}"
        node_id = uuid.uuid5(_NS, f"taxonomy:{accum}")
        if session.get(TaxonomyNodeModel, node_id) is None:
            session.add(
                TaxonomyNodeModel(
                    id=node_id, parent_id=parent, name=name, level=level, market_id=market_id
                )
            )
            session.flush()
        parent = node_id
    assert node_id is not None
    return str(node_id)


def _drop_legacy_key(session: Session, provider_uuid: uuid.UUID, current_external_id: str) -> None:
    """Borra el store_product legacy "garza-10lb" (y su histórico) si el provider ya usa SKU real.

    DBs de dev sembradas antes del wiring quedarían con DOS cotizaciones por tienda (la llave
    sintética vieja + la real). Dev-only: el seed es la única fuente de esas filas.
    """
    if current_external_id == "garza-10lb":
        return
    legacy = session.scalars(
        select(StoreProductModel).where(
            StoreProductModel.provider_id == provider_uuid,
            StoreProductModel.external_id == "garza-10lb",
        )
    ).first()
    if legacy is None:
        return
    for price in session.scalars(select(PriceModel).where(PriceModel.store_product_id == legacy.id)):
        session.delete(price)
    session.delete(legacy)
    session.flush()


# ── Catálogo realista (§ dev): ~48 productos bajo "Arroz, Granos & Legumbres" para poder VER y
#    verificar en vivo paginación (>40 en la rama), facetas ricas (Ver más), orden y ofertas.
#    Precios deterministas por tienda (idempotente); algunos "en oferta" con historial de bajada.
_GL = ["Despensa & Abarrotes", "Arroz, Granos & Legumbres"]
_LEAVES: dict[str, list[str]] = {
    "arroz-blanco": [*_GL, "Arroz", "Arroz Blanco"],
    "arroz-integral": [*_GL, "Arroz", "Arroz Integral"],
    "granos": [*_GL, "Granos"],
    "habichuelas": [*_GL, "Legumbres", "Habichuelas"],
    "lentejas": [*_GL, "Legumbres", "Lentejas"],
}

# (key, brand, name, size_str, display_size, quality, leaf, base_minor, on_sale)
_CATALOG: list[tuple[str, str, str, str, str, str | None, str, int, bool]] = [
    ("campos-10", "Campos", "Arroz Premium Campos", "10 lb", "10 LB", "Premium", "arroz-blanco", 45000, False),
    ("bravo-prem-10", "Bravo", "Bravo Arroz Premium", "10 lb", "10 LB", "Premium", "arroz-blanco", 31900, True),
    ("pimco-funda-10", "Pimco", "Arroz Premium Pimco Funda", "10 lb", "10 LB", "Premium", "arroz-blanco", 40000, False),
    ("campos-20", "Campos", "Arroz Premium Campos", "20 lb", "20 LB", "Premium", "arroz-blanco", 91995, False),
    ("campos-5", "Campos", "Arroz Premium Campos", "5 lb", "5 LB", "Premium", "arroz-blanco", 22995, False),
    ("pimco-selecto-10", "Pimco", "Arroz Selecto Pimco", "10 lb", "10 LB", "Selecto", "arroz-blanco", 39900, False),
    ("bisono-sel-10", "Bisonó", "Arroz Súper Selecto Bisonó", "10 lb", "10 LB", "Selecto", "arroz-blanco", 39000, False),
    ("bisono-5", "Bisonó", "Arroz Enriquecido Bisonó", "5 lb", "5 LB", "Premium", "arroz-blanco", 21195, False),
    ("bisono-20", "Bisonó", "Arroz Enriquecido Bisonó", "20 lb", "20 LB", "Premium", "arroz-blanco", 76000, False),
    ("wala-5", "Wala", "Arroz Selecto Wala", "5 lb", "5 LB", "Selecto", "arroz-blanco", 20700, False),
    ("nacional-10", "Nacional", "Arroz Premium Nacional", "10 lb", "10 LB", "Premium", "arroz-blanco", 33995, False),
    ("lider-10", "Líder", "Arroz Selecto Líder", "10 lb", "10 LB", "Selecto", "arroz-blanco", 32795, True),
    ("donrodrigo-10", "Don Rodrigo", "Arroz Don Rodrigo", "10 lb", "10 LB", "Premium", "arroz-blanco", 41495, False),
    ("selecta-10", "Selecta", "Arroz Blanco Selecta", "10 lb", "10 LB", "Premium", "arroz-blanco", 36000, False),
    ("nutritivo-5", "Nutritivo", "Arroz Nutritivo", "5 lb", "5 LB", "Selecto", "arroz-blanco", 18500, False),
    ("campos-extra-10", "Campos", "Arroz Extra Largo Campos", "10 lb", "10 LB", "Premium", "arroz-blanco", 44000, False),
    ("garza-5", "La Garza", "Arroz Enriquecido La Garza", "5 lb", "5 LB", "Premium", "arroz-blanco", 21200, False),
    ("garza-3", "La Garza", "Arroz Enriquecido La Garza", "3 lb", "3 LB", "Premium", "arroz-blanco", 14000, False),
    ("garza-20", "La Garza", "Arroz Enriquecido La Garza", "20 lb", "20 LB", "Premium", "arroz-blanco", 90900, False),
    ("pimco-g1-10", "Pimco", "Arroz Pimco Grado 1", "10 lb", "10 LB", "Selecto", "arroz-blanco", 39900, False),
    ("bravo-extra-5", "Bravo", "Arroz Bravo Extra Largo", "5 lb", "5 LB", "Selecto", "arroz-blanco", 18900, False),
    ("blanquita-10", "Blanquita", "Arroz Blanquita", "10 lb", "10 LB", "Premium", "arroz-blanco", 37500, False),
    ("donana-10", "Doña Ana", "Arroz Doña Ana", "10 lb", "10 LB", "Selecto", "arroz-blanco", 38000, False),
    ("primor-10", "Primor", "Arroz Primor", "10 lb", "10 LB", "Premium", "arroz-blanco", 40500, True),
    ("bisono-25", "Bisonó", "Arroz Bisonó Grado A", "25 lb", "25 LB", "Premium", "arroz-blanco", 110000, False),
    ("goya-integral-2", "Goya", "Arroz Integral Goya", "2 lb", "2 LB", "Premium", "arroz-integral", 14500, False),
    ("garza-integral-5", "La Garza", "Arroz Integral La Garza", "5 lb", "5 LB", "Premium", "arroz-integral", 24500, False),
    ("bravo-integral-5", "Bravo", "Arroz Integral Bravo", "5 lb", "5 LB", "Selecto", "arroz-integral", 22000, True),
    ("campos-integral-10", "Campos", "Arroz Integral Campos", "10 lb", "10 LB", "Premium", "arroz-integral", 48000, False),
    ("vitasano-integral-2", "Vitasano", "Arroz Integral Vitasano", "2 lb", "2 LB", "Premium", "arroz-integral", 15500, False),
    ("gisselle-hab-800", "Gisselle", "Habichuelas Rojas Gisselle", "800 gr", "800 GR", None, "habichuelas", 13500, True),
    ("goya-hab-negras", "Goya", "Habichuelas Negras Goya", "1 lb", "1 LB", None, "habichuelas", 9500, False),
    ("sanjuanera-hab-rojas", "La Sanjuanera", "Habichuelas Rojas La Sanjuanera", "1 lb", "1 LB", None, "habichuelas", 8900, False),
    ("bravo-hab-rosadas", "Bravo", "Habichuelas Rosadas Bravo", "1 lb", "1 LB", None, "habichuelas", 9900, False),
    ("nacional-hab-blancas", "Nacional", "Habichuelas Blancas Nacional", "1 lb", "1 LB", None, "habichuelas", 10500, False),
    ("goya-hab-pintas", "Goya", "Habichuelas Pintas Goya", "1 lb", "1 LB", None, "habichuelas", 9800, False),
    ("carrefour-hab-negras", "Carrefour", "Habichuelas Negras Carrefour", "1 lb", "1 LB", None, "habichuelas", 8700, False),
    ("goya-lentejas", "Goya", "Lentejas Goya", "1 lb", "1 LB", None, "lentejas", 8500, False),
    ("sanjuanera-lentejas", "La Sanjuanera", "Lentejas La Sanjuanera", "1 lb", "1 LB", None, "lentejas", 7900, False),
    ("bravo-lentejas", "Bravo", "Lentejas Bravo", "1 lb", "1 LB", None, "lentejas", 8200, False),
    ("nacional-lentejas", "Nacional", "Lentejas Nacional", "1 lb", "1 LB", None, "lentejas", 8800, False),
    ("goya-garbanzos", "Goya", "Garbanzos Goya", "1 lb", "1 LB", None, "granos", 11500, False),
    ("bravo-guandules", "Bravo", "Guandules Verdes Bravo", "15 oz", "15 OZ", None, "granos", 6500, True),
    ("sanjuanera-maiz", "La Sanjuanera", "Maíz Trillado La Sanjuanera", "1 lb", "1 LB", None, "granos", 5500, False),
    ("goya-gandules", "Goya", "Gandules Goya", "15 oz", "15 OZ", None, "granos", 6900, False),
    ("nacional-frijoles", "Nacional", "Frijoles Negros Nacional", "1 lb", "1 LB", None, "granos", 9200, False),
    ("goya-arvejas", "Goya", "Arvejas Verdes Goya", "15 oz", "15 OZ", None, "granos", 7200, False),
    ("bravo-maiz-dulce", "Bravo", "Maíz Dulce Bravo", "15 oz", "15 OZ", None, "granos", 5900, False),
]


# ── Colecciones curadas (A6): productos hand-pick de Protector solar y Limpieza, con sus hojas de
#    taxonomía propias. Se agrupan en dos colecciones EDITORIALES (no responden a "en oferta" ni a
#    una sola categoría) → alimentan los carruseles curados de la home y su página propia.
_PROTECTOR_LEAF = ["Cuidado Personal", "Cuidado Corporal", "Protector Solar"]
_LIMPIEZA_LEAF = ["Cuidado Del Hogar", "Limpieza Del Hogar"]

# (key, brand, name, size, disp, quality, base_minor, on_sale)
_PROTECTOR_SOLAR: list[tuple[str, str, str, str, str, str | None, int, bool]] = [
    ("nivea-sun-50", "Nivea", "Protector Solar Nivea Sun FPS 50", "200 ml", "200 ML", None, 89500, False),
    ("banana-boat-sport-50", "Banana Boat", "Banana Boat Sport FPS 50", "170 gr", "170 GR", None, 79900, True),
    ("coppertone-ultra-30", "Coppertone", "Coppertone Ultra Guard FPS 30", "148 ml", "148 ML", None, 72500, False),
    ("neutrogena-sheer-70", "Neutrogena", "Neutrogena Ultra Sheer FPS 70", "88 ml", "88 ML", "Premium", 118000, False),
    ("eucerin-oil-50", "Eucerin", "Eucerin Sun Oil Control FPS 50", "50 ml", "50 ML", "Premium", 145000, False),
    ("hawaiian-silk-50", "Hawaiian Tropic", "Hawaiian Tropic Silk Hydration FPS 50", "180 ml", "180 ML", None, 95000, True),
    ("nivea-kids-50", "Nivea", "Nivea Sun Kids Protect FPS 50", "200 ml", "200 ML", None, 92500, False),
    ("banana-kids-60", "Banana Boat", "Banana Boat Kids FPS 60", "180 ml", "180 ML", None, 88000, False),
]

# (key, brand, name, size, disp, quality, base_minor, on_sale)
_LIMPIEZA: list[tuple[str, str, str, str, str, str | None, int, bool]] = [
    ("mistolin-lavanda", "Mistolin", "Limpiador Mistolin Lavanda", "1 gl", "1 GL", None, 25900, False),
    ("clorox-original", "Clorox", "Cloro Clorox Original", "1 gl", "1 GL", None, 19500, True),
    ("fabuloso-lavanda", "Fabuloso", "Fabuloso Lavanda", "1 gl", "1 GL", None, 22500, False),
    ("mistolin-brisa", "Mistolin", "Mistolin Brisa Fresca", "1 gl", "1 GL", None, 24900, False),
    ("ajax-limon", "Ajax", "Ajax Limón Multiusos", "1 gl", "1 GL", None, 21000, True),
    ("clorox-gel", "Clorox", "Clorox Gel Adherente", "709 ml", "709 ML", None, 15500, False),
    ("suavitel-primavera", "Suavitel", "Suavizante Suavitel Primavera", "850 ml", "850 ML", None, 17900, False),
    ("cif-crema", "Cif", "Cif Crema Multiuso", "750 ml", "750 ML", None, 14500, False),
]

# (slug, name, position, dataset) — el orden del dataset ES el orden hand-pick de la colección.
_COLLECTIONS: list[tuple[str, str, int, list[tuple[str, str, str, str, str, str | None, int, bool]]]] = [
    ("protector-solar", "Protector solar", 0, _PROTECTOR_SOLAR),
    ("limpieza", "Limpieza", 1, _LIMPIEZA),
]
_COLLECTION_LEAF = {"protector-solar": _PROTECTOR_LEAF, "limpieza": _LIMPIEZA_LEAF}


def _det(*parts: object) -> int:
    """Entero DETERMINISTA de las partes (para precios/subset por tienda estables entre corridas)."""
    return int(uuid.uuid5(_NS, ":".join(str(p) for p in parts)).hex[:8], 16)


def _has_price_history(session: Session, provider_uuid: uuid.UUID, external_id: str) -> bool:
    """¿El store_product ya tiene ≥2 filas de precio? (para no re-sembrar la bajada en cada corrida)."""
    sp = session.scalars(
        select(StoreProductModel).where(
            StoreProductModel.provider_id == provider_uuid,
            StoreProductModel.external_id == external_id,
        )
    ).first()
    if sp is None:
        return False
    count = session.scalar(
        select(func.count()).select_from(PriceModel).where(PriceModel.store_product_id == sp.id)
    )
    return (count or 0) >= 2


def _seed_product(  # type: ignore[no-untyped-def]
    session: Session, canon_repo, store_repo, now: datetime, *,
    key: str, brand: str, name: str, size: str, disp: str, quality: str | None,
    node_id: str, base: int, on_sale: bool,
) -> str:
    """Siembra UN producto (canónico + subset determinista de tiendas). Devuelve su canonical id."""
    cid = uuid.uuid5(_NS, f"canonical:DO:{key}")
    if session.get(CanonicalProductModel, cid) is None:
        canon_repo.add(
            CanonicalProduct(
                str(cid), name, brand, parse_size(size),
                taxonomy_node_id=node_id, market_id="DO",
                quality=quality, display_size=disp,
            )
        )
    # subset determinista de tiendas (≥3): la tienda entra si _det no es múltiplo de 4.
    carried = [n for (n, _) in _PROVIDERS if _det(key, n) % 4 != 0]
    if len(carried) < 3:
        carried = [n for (n, _) in _PROVIDERS][:4]
    for i, pname in enumerate(carried):
        ext = f"{key}--{slugify(pname)}"
        delta = ((_det(key, pname) % 11) - 5) * (base // 100)  # ±5% por tienda
        price = base + delta
        # producto "en oferta": la 1ª tienda tuvo un precio ~12% más alto hace 3 días (bajada).
        if on_sale and i == 0 and not _has_price_history(session, provider_id(pname), ext):
            store_repo.record_observation(
                provider_id=str(provider_id(pname)), external_id=ext,
                canonical_product_id=str(cid), price=Money(price + base * 12 // 100, DOP),
                captured_at=now - timedelta(days=3), price_type=PriceType.ONLINE, source="seed",
            )
        store_repo.record_observation(
            provider_id=str(provider_id(pname)), external_id=ext,
            canonical_product_id=str(cid), price=Money(price, DOP),
            captured_at=now, price_type=PriceType.ONLINE, source="seed",
        )
    return str(cid)


def _seed_catalog(session: Session, canon_repo, store_repo, now: datetime) -> None:  # type: ignore[no-untyped-def]
    """Siembra el catálogo realista (idempotente). Cada producto → subset determinista de tiendas."""
    for key, brand, name, size, disp, quality, leaf, base, on_sale in _CATALOG:
        _seed_product(
            session, canon_repo, store_repo, now,
            key=key, brand=brand, name=name, size=size, disp=disp, quality=quality,
            node_id=_taxonomy_leaf(session, "DO", _LEAVES[leaf]), base=base, on_sale=on_sale,
        )


def _upsert_collection(  # type: ignore[no-untyped-def]
    session: Session, *, slug: str, name: str, position: int, product_ids: list[str]
) -> None:
    """Crea (idempotente) la colección y engancha sus productos EN ORDEN (position = índice)."""
    coll_id = uuid.uuid5(_NS, f"collection:DO:{slug}")
    if session.get(CollectionModel, coll_id) is None:
        session.add(
            CollectionModel(
                id=coll_id, slug=slug, name=name, market_id="DO", position=position
            )
        )
        session.flush()
    for pos, pid in enumerate(product_ids):
        cp_id = uuid.uuid5(_NS, f"collection_product:DO:{slug}:{pid}")
        if session.get(CollectionProductModel, cp_id) is None:
            session.add(
                CollectionProductModel(
                    id=cp_id, collection_id=coll_id,
                    canonical_product_id=uuid.UUID(pid), position=pos,
                )
            )
    session.flush()


def _seed_collections(session: Session, canon_repo, store_repo, now: datetime) -> None:  # type: ignore[no-untyped-def]
    """Siembra los productos de cada colección curada (A6) y las colecciones (hand-pick, en orden)."""
    for slug, name, position, dataset in _COLLECTIONS:
        node_id = _taxonomy_leaf(session, "DO", _COLLECTION_LEAF[slug])
        product_ids = [
            _seed_product(
                session, canon_repo, store_repo, now,
                key=key, brand=brand, name=pname, size=size, disp=disp, quality=quality,
                node_id=node_id, base=base, on_sale=on_sale,
            )
            for key, brand, pname, size, disp, quality, base, on_sale in dataset
        ]
        _upsert_collection(
            session, slug=slug, name=name, position=position, product_ids=product_ids
        )


def _seed_sources(session: Session) -> None:
    """Siembra el `StoreRegistry` de las fuentes con adapter propio (hoy: Bravo Va, REST_CATALOG).

    Idempotente (1:1 con Provider): no re-crea si ya existe. Es lo que hace aparecer la fuente en el
    panel de ingesta y habilita su botón "Probar". El resto de cadenas (VTEX/Magento/agregadores) aún
    no tienen StoreRegistry sembrado — su wiring vive en `ingestion/save/sources.py` (bridge F1)."""
    registry_repo = SqlStoreRegistryRepository(session)
    bravo_pid = str(provider_id("Bravo"))
    if registry_repo.get_by_provider_id(bravo_pid) is None:
        registry_repo.add(
            StoreRegistry(
                id=str(uuid.uuid5(_NS, "store_registry:DO:Bravo")),
                provider_id=bravo_pid,
                platform=SourcePlatform.REST_CATALOG,
                base_url=BRAVO_BASE_URL,
                endpoints=BRAVO_SOURCE_ENDPOINTS,
            )
        )


def seed_save(session: Session) -> None:
    prov_repo = SqlProviderRepository(session)
    canon_repo = SqlCanonicalProductRepository(session)
    store_repo = SqlStoreProductRepository(session)

    # 1) proveedores (cadenas RD)
    for name, platform in _PROVIDERS:
        pid = provider_id(name)
        if session.get(ProviderModel, pid) is None:
            prov_repo.add(Provider(str(pid), name, ProviderType.SUPERMARKET, platform, "DO"))

    # 1.5) fuentes de extracción (StoreRegistry) — Bravo Va (REST_CATALOG)
    _seed_sources(session)

    # 2) taxonomía: las 15 categorías top + TODAS sus subcategorías + la hoja "Arroz Blanco"
    #    (misma llave uuid5 determinista: el prefijo compartido con _ARROZ_PATH reusa el nodo).
    for cat, subs in _TAXONOMY.items():
        _taxonomy_leaf(session, "DO", [cat])
        for sub in subs:
            _taxonomy_leaf(session, "DO", [cat, sub])
    node_id = _taxonomy_leaf(session, "DO", _ARROZ_PATH)

    # 3) producto canónico (matcheo manual = todos los store_products apuntan acá)
    cid = uuid.uuid5(_NS, "canonical:DO:arroz-la-garza-10lb")
    if session.get(CanonicalProductModel, cid) is None:
        canon_repo.add(
            CanonicalProduct(
                str(cid),
                "Arroz Enriquecido La Garza",
                "La Garza",
                parse_size("10 Lbs"),
                taxonomy_node_id=node_id,
                market_id="DO",
                quality="Premium",
                display_size="10 LB",
                image_url=(
                    "https://gruporamos.vteximg.com.br/arquivos/ids/166286/"
                    "1-und-7463851146038.jpg"
                ),
            )
        )

    # 4) precios por tienda (change-only)
    now = datetime.now(timezone.utc)
    for name, (external_id, minor) in _GARZA_10LB_PRICES.items():
        _drop_legacy_key(session, provider_id(name), external_id)
        store_repo.record_observation(
            provider_id=str(provider_id(name)),
            external_id=external_id,
            canonical_product_id=str(cid),
            price=Money(minor, DOP),
            captured_at=now,
            price_type=PriceType.ONLINE,
            source="seed",
        )

    # 5) catálogo realista (~48 productos bajo Arroz, Granos & Legumbres) para dev/QA visual
    _seed_catalog(session, canon_repo, store_repo, now)

    # 6) colecciones curadas (A6): Protector solar + Limpieza (hand-pick) para los carruseles
    _seed_collections(session, canon_repo, store_repo, now)

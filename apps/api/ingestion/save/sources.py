"""Wiring de fuentes de catálogo de Save — config PURA (sin red, sin dagster).

Única fuente de verdad del wiring, compartida por el runner CLI (`make save-refresh`) y por los
assets de Dagster. Un adaptador por (fuente, query de la canasta). Fuentes verificadas en vivo
(doc 09): Sirena=VTEX · Nacional/Jumbo=Magento CCN (Jumbo con header `Store: jumbo`). Scoping por
CANASTA curada (doc 02), no full-catalog. Los IDs de provider salen del seed (bridge de F1 hasta
que exista `store_registry`, doc 06).
"""
from __future__ import annotations

from src.contexts.save.domain.ports import CatalogSource
from src.contexts.save.infrastructure.catalog_sources.magento_adapter import MagentoAdapter
from src.contexts.save.infrastructure.catalog_sources.vtex_adapter import VtexAdapter

from seeds.save_seed import provider_id

SAVE_MARKET = "DO"

# Canasta curada (doc 02) — STARTING POINT para bootstrapear el matching (cold-start), NO el
# catálogo completo. Cada string es una query de búsqueda genérica que los adaptadores VTEX/
# Magento resuelven contra el buscador de cada tienda; se prefieren productos de alta rotación
# que existan en MÚLTIPLES cadenas RD (la comparabilidad es el punto — Batch 9, F2.0). Se
# refinará con datos reales de matching (falsos negativos/positivos) en iteraciones futuras.

_GRANOS_Y_LEGUMBRES = (
    "arroz la garza",
    "arroz blue ribbon",
    "arroz conito",
    "arroz selecto",
    "arroz valle del cibao",
    "arroz integral",
    "habichuelas rojas la famosa",
    "habichuelas negras la famosa",
    "habichuelas blancas la famosa",
    "habichuelas pintas",
    "guandules verdes",
    "guandules secos",
    "lentejas la famosa",
    "garbanzos la famosa",
    "maiz amarillo",
    "arroz precocido",
    "moro de guandules",
)

_VIVERES = (
    "platano verde",
    "platano maduro",
    "guineo verde",
    "yuca",
    "yautia amarilla",
    "batata",
    "name",
    "auyama",
    "papa",
    "chayote",
    "berenjena",
)

_ACEITES_Y_GRASAS = (
    "aceite crisol",
    "aceite mazola",
    "aceite de oliva",
    "aceite de canola",
    "manteca vegetal",
    "margarina cremora",
    "mantequilla president",
)

_LACTEOS = (
    "leche rica entera",
    "leche rica descremada",
    "leche evaporada carnation",
    "leche en polvo nido",
    "leche condensada la lechera",
    "yogurt yoplait",
    "yogurt griego rica",
    "queso de freir rica",
    "queso crema philadelphia",
    "queso mozzarella",
    "queso cheddar",
    "queso parmesano",
    "mantequilla rica",
    "crema de leche rica",
    "requeson",
    "leche de cabra",
)

_HUEVOS = (
    "huevos rica",
    "huevos indita",
    "huevos rojos",
    "huevos organicos",
)

_PANADERIA_Y_GALLETAS = (
    "pan de agua",
    "pan de sandwich bimbo",
    "pan sobado",
    "pan integral bimbo",
    "pan de coco",
    "galletas de soda cristal",
    "galletitas maria",
    "galletas oreo",
    "galletas ritz",
    "donas",
    "cachitos",
)

_PASTAS = (
    "espagueti la muneca",
    "spaghetti rica",
    "coditos",
    "fideos cabello de angel",
    "pasta penne",
    "lasagna",
    "macarrones",
    "vermicelli",
    "pasta rotini",
)

_SALSAS_Y_CONDIMENTOS = (
    "salsa de tomate ketchup heinz",
    "mayonesa hellmanns",
    "mostaza french",
    "salsa inglesa lea perrins",
    "salsa china la cigueña",
    "vinagre blanco",
    "sazon con culantro y achiote goya",
    "sazon completa maggi",
    "adobo goya",
    "salsa picante",
    "salsa bbq",
    "caldo de pollo maggi",
    "caldo de res maggi",
    "salsa alfredo",
    "salsa teriyaki",
)

_CAFE = (
    "cafe santo domingo",
    "cafe induban",
    "cafe cerro dorado",
    "cafe president",
    "cafe lorenzo",
)

_AZUCAR_Y_ENDULZANTES = (
    "azucar cruda",
    "azucar refinada",
    "azucar morena",
    "miel de abeja",
    "splenda",
)

_SAL_Y_ESPECIAS = (
    "sal de mesa",
    "sal marina",
    "pimienta negra molida",
    "oregano",
    "comino",
    "ajo en polvo",
    "cebolla en polvo",
    "canela en polvo",
    "curry",
    "laurel",
)

_ENLATADOS_Y_CONSERVAS = (
    "sardinas goya",
    "atun goya",
    "atun ademar",
    "pasta de tomate goya",
    "salsa de tomate enlatada",
    "vegetales mixtos enlatados",
    "maiz dulce enlatado",
    "pina en almibar",
    "duraznos en almibar",
    "aceitunas",
    "champiñones enlatados",
    "frijoles enlatados",
    "garbanzos enlatados",
    "pate de higado",
)

_EMBUTIDOS = (
    "salami induveca",
    "jamon induveca",
    "jamonilla",
    "salchichas induveca",
    "mortadela",
    "tocineta",
    "chorizo",
    "longaniza",
    "pepperoni",
    "butifarra",
)

_CARNES = (
    "pollo entero rica",
    "pechuga de pollo rica",
    "muslos de pollo",
    "alas de pollo",
    "carne de res molida",
    "carne de res para guisar",
    "bistec de res",
    "cerdo chuleta",
    "costillas de cerdo",
    "pernil de cerdo",
    "higado de res",
    "pavo molido",
    "conejo",
)

_BEBIDAS = (
    "agua planeta azul",
    "agua crystal",
    "refresco coca cola",
    "refresco pepsi",
    "refresco sprite",
    "jugo naturas",
    "jugo rica",
    "malta morena",
    "cerveza presidente",
    "jugo de china",
    "te helado lipton",
    "agua de coco",
    "energizante red bull",
)

_LIMPIEZA = (
    "detergente en polvo ace",
    "detergente liquido ariel",
    "jabon de lavar zote",
    "cloro clorox",
    "suavizante suavitel",
    "limpiador multiusos fabuloso",
    "lavaplatos axion",
    "esponja para lavar platos",
    "papel toalla scott",
    "bolsas de basura",
    "desinfectante lysol",
    "ambientador glade",
    "insecticida raid",
    "papel aluminio",
)

_HIGIENE_PERSONAL = (
    "papel higienico scott",
    "pasta dental colgate",
    "cepillo de dientes oral b",
    "desodorante rexona",
    "jabon de bano protex",
    "shampoo pantene",
    "acondicionador pantene",
    "toallas sanitarias always",
    "rastrillos gillette",
    "enjuague bucal listerine",
    "algodon",
    "cotonetes q tips",
    "protector diario",
    "crema de afeitar",
)

_BEBE = (
    "pañales pampers",
    "pañales huggies",
    "formula infantil similac",
    "formula infantil enfamil",
    "toallitas humedas huggies",
    "leche nan",
    "cereal infantil gerber",
    "biberones",
    "leche de formula etapa 2",
)

_HARINAS_Y_HORNEO = (
    "harina de trigo gold medal",
    "harina preparada",
    "polvo de hornear royal",
    "levadura fleischmann",
    "vainilla",
    "chocolate en polvo",
    "harina de maiz",
    "esencia de almendra",
    "cocoa",
)

_CEREALES_Y_AVENA = (
    "corn flakes kelloggs",
    "cereal froot loops",
    "avena en hojuelas quaker",
    "avena instantanea",
    "granola",
    "special k",
    "cheerios",
)

BASKET_QUERIES: tuple[str, ...] = (
    _GRANOS_Y_LEGUMBRES
    + _VIVERES
    + _ACEITES_Y_GRASAS
    + _LACTEOS
    + _HUEVOS
    + _PANADERIA_Y_GALLETAS
    + _PASTAS
    + _SALSAS_Y_CONDIMENTOS
    + _CAFE
    + _AZUCAR_Y_ENDULZANTES
    + _SAL_Y_ESPECIAS
    + _ENLATADOS_Y_CONSERVAS
    + _EMBUTIDOS
    + _CARNES
    + _BEBIDAS
    + _LIMPIEZA
    + _HIGIENE_PERSONAL
    + _BEBE
    + _HARINAS_Y_HORNEO
    + _CEREALES_Y_AVENA
)


def build_sources(
    queries: tuple[str, ...] = BASKET_QUERIES,
) -> dict[str, list[CatalogSource]]:
    """Fuentes de catálogo por tienda: {clave: [adapter por query]}. No dispara red."""
    sirena_id = str(provider_id("Sirena"))
    nacional_id = str(provider_id("Nacional"))
    jumbo_id = str(provider_id("Jumbo"))
    return {
        "sirena": [
            VtexAdapter(
                base_url="https://www.sirena.do",
                provider_id=sirena_id,
                market_id=SAVE_MARKET,
                query=query,
            )
            for query in queries
        ],
        "nacional": [
            MagentoAdapter(
                base_url="https://supermercadosnacional.com",
                provider_id=nacional_id,
                market_id=SAVE_MARKET,
                query=query,
            )
            for query in queries
        ],
        "jumbo": [
            MagentoAdapter(
                base_url="https://jumbo.com.do",
                provider_id=jumbo_id,
                market_id=SAVE_MARKET,
                query=query,
                store_code="jumbo",  # misma instancia CCN; el header elige el store view
            )
            for query in queries
        ],
    }

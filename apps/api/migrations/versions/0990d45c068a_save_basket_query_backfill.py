"""save basket_query backfill

Revision ID: 0990d45c068a
Revises: 09526c5ccaca
Create Date: 2026-07-06 00:00:00.000000

F2 · B1/B3 — Batch 3D, tarea 3.15. Backfill de la canasta curada (`ingestion/save/sources.py::
BASKET_QUERIES`) en la tabla `basket_query` (creada en `09526c5ccaca`) para el mercado "DO".

Las 213 queries curadas se COPIAN AQUÍ como literal, no se importan desde `ingestion.save.sources`
(esa importación arrastra los adapters de catálogo + `seeds.save_seed` — dependencias pesadas y
además una migración debe ser un snapshot histórico auto-contenido: si el código de aplicación
cambia mañana, esta migración debe seguir corriendo igual). NO se modifica `BASKET_QUERIES` en
`sources.py` en este batch — la ingesta viva lo sigue leyendo hasta que el cutover (fuera de
alcance aquí) apunte a esta tabla.

Idempotente: `INSERT ... ON CONFLICT (market_id, query_text) DO NOTHING` — reejecutar `upgrade()`
contra una DB que ya tiene algunas de estas filas no falla ni duplica. `downgrade()` borra
ÚNICAMENTE las filas de `market_id="DO"` cuyo `query_text` está en el set conocido de este
backfill — así no se lleva por delante filas que un admin haya agregado después desde la consola.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import insert as pg_insert

revision = '0990d45c068a'
down_revision = '09526c5ccaca'
branch_labels = None
depends_on = None

_MARKET = "DO"

# Copiado literal de ingestion/save/sources.py (snapshot histórico — ver docstring del módulo).
_GROUPS: dict[str, tuple[str, ...]] = {
    "Granos y legumbres": (
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
    ),
    "Víveres": (
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
    ),
    "Aceites y grasas": (
        "aceite crisol",
        "aceite mazola",
        "aceite de oliva",
        "aceite de canola",
        "manteca vegetal",
        "margarina cremora",
        "mantequilla president",
    ),
    "Lácteos": (
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
    ),
    "Huevos": (
        "huevos rica",
        "huevos indita",
        "huevos rojos",
        "huevos organicos",
    ),
    "Panadería y galletas": (
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
    ),
    "Pastas": (
        "espagueti la muneca",
        "spaghetti rica",
        "coditos",
        "fideos cabello de angel",
        "pasta penne",
        "lasagna",
        "macarrones",
        "vermicelli",
        "pasta rotini",
    ),
    "Salsas y condimentos": (
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
    ),
    "Café": (
        "cafe santo domingo",
        "cafe induban",
        "cafe cerro dorado",
        "cafe president",
        "cafe lorenzo",
    ),
    "Azúcar y endulzantes": (
        "azucar cruda",
        "azucar refinada",
        "azucar morena",
        "miel de abeja",
        "splenda",
    ),
    "Sal y especias": (
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
    ),
    "Enlatados y conservas": (
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
    ),
    "Embutidos": (
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
    ),
    "Carnes": (
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
    ),
    "Bebidas": (
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
    ),
    "Limpieza": (
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
    ),
    "Higiene personal": (
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
    ),
    "Bebé": (
        "pañales pampers",
        "pañales huggies",
        "formula infantil similac",
        "formula infantil enfamil",
        "toallitas humedas huggies",
        "leche nan",
        "cereal infantil gerber",
        "biberones",
        "leche de formula etapa 2",
    ),
    "Harinas y horneo": (
        "harina de trigo gold medal",
        "harina preparada",
        "polvo de hornear royal",
        "levadura fleischmann",
        "vainilla",
        "chocolate en polvo",
        "harina de maiz",
        "esencia de almendra",
        "cocoa",
    ),
    "Cereales y avena": (
        "corn flakes kelloggs",
        "cereal froot loops",
        "avena en hojuelas quaker",
        "avena instantanea",
        "granola",
        "special k",
        "cheerios",
    ),
}


def _basket_query_table() -> sa.Table:
    metadata = sa.MetaData(schema="save")
    return sa.Table(
        "basket_query",
        metadata,
        sa.Column("id", sa.UUID()),
        sa.Column("market_id", sa.Text()),
        sa.Column("category_label", sa.Text()),
        sa.Column("query_text", sa.Text()),
        sa.Column("position", sa.Integer()),
        sa.Column("active", sa.Boolean()),
    )


def _known_query_texts() -> list[str]:
    return [query_text for queries in _GROUPS.values() for query_text in queries]


def upgrade() -> None:
    table = _basket_query_table()
    bind = op.get_bind()
    rows = []
    position = 0
    for category_label, queries in _GROUPS.items():
        for query_text in queries:
            rows.append(
                {
                    "market_id": _MARKET,
                    "category_label": category_label,
                    "query_text": query_text,
                    "position": position,
                    "active": True,
                }
            )
            position += 1
    stmt = pg_insert(table).values(rows).on_conflict_do_nothing(
        index_elements=["market_id", "query_text"]
    )
    bind.execute(stmt)


def downgrade() -> None:
    table = _basket_query_table()
    bind = op.get_bind()
    bind.execute(
        table.delete().where(
            table.c.market_id == _MARKET,
            table.c.query_text.in_(_known_query_texts()),
        )
    )

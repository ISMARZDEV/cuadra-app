"""DEV: siembra un catálogo DEMO completo — 17 categorías × 3 proveedores, con matches y precios.

El catálogo de dev nació monotemático (70% arroz, 0 café, 0 carnes) y con 113 de 133 canónicos en
UNA sola tienda, así que casi nada era COMPARABLE. Sin comparables no se puede probar lo que el
`GroceriesAgent` tiene que responder: «¿dónde está más barato?», «¿qué súper me conviene?», la
canasta por presupuesto. Este seed llena ese hueco con datos de prueba explícitos.

Qué crea, por cada producto de la tabla de abajo:
  1. un `canonical_product` (con su hoja de taxonomía y su cantidad parseada),
  2. un `store_product` en **Bravo, Sirena y Nacional**, con precios DISTINTOS,
  3. el `product_match` que enlaza cada uno al canónico (auto_linked).

Reglas que respeta:
  - **Dinero en minor units enteros.** Nunca float.
  - **El proveedor más barato ROTA** entre productos: ningún súper gana siempre, que es como se
    comporta el mercado real y es justo lo que la tool `cheapest_store_by_category` debe mostrar.
  - **Idempotente**: los `external_id` llevan el prefijo `demo-`; re-correrlo no duplica.
  - Los precios se derivan de forma DETERMINISTA del nombre, así que dos corridas dan lo mismo.

⚠️ Son datos de PRUEBA, no ingesta real: los `store_product` no tienen URL de tienda verdadera ni
EAN. Se distinguen por el prefijo `demo-` del `external_id`, que es lo que permite borrarlos.

Uso:
    cd apps/api && uv run python -m seeds.demo_catalog            # siembra
    cd apps/api && uv run python -m seeds.demo_catalog --purge    # borra SOLO lo sembrado
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from hashlib import blake2b

from sqlalchemy import text

from src.contexts.save.domain.entities import CanonicalProduct, PriceType
from src.contexts.save.domain.value_objects import parse_size
from src.contexts.save.infrastructure.matching.repository import SqlProductMatchRepository
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)
from src.shared.db.base import SessionLocal
from src.shared.money import Currency, Money

MARKET = "DO"
DOP = Currency("DOP")
PROVIDERS = ("Bravo", "Sirena", "Nacional")
DEMO_PREFIX = "demo-"

# (hoja de taxonomía, nombre, marca, tamaño, precio base en DOP mayor)
# Precios de orden realista para RD (2026). El precio base es el "de mercado"; cada tienda se
# desvía de él más abajo.
PRODUCTS: list[tuple[str, str, str, str, int]] = [
    # ── Despensa & Abarrotes ────────────────────────────────────────────────────────────────
    ("Café", "Café Molido Santo Domingo 1 Lb", "SANTO DOMINGO", "1 Lb", 495),
    ("Café", "Café Molido Induban Gourmet 1 Lb", "INDUBAN", "1 Lb", 545),
    ("Café", "Café Molido Monte Alto 8 Oz", "MONTE ALTO", "8 Oz", 285),
    ("Café", "Café Instantáneo Nescafé Clásico 200 Gr", "NESCAFE", "200 Gr", 640),
    ("Aceite & Vinagre", "Aceite Vegetal Crisol 1 Gl", "CRISOL", "1 Gl", 1250),
    ("Aceite & Vinagre", "Aceite De Oliva Extra Virgen Pompeian 500 Ml", "POMPEIAN", "500 Ml", 895),
    ("Aceite & Vinagre", "Aceite Vegetal Mazola 48 Oz", "MAZOLA", "48 Oz", 720),
    ("Aceite & Vinagre", "Vinagre Blanco Baldom 500 Ml", "BALDOM", "500 Ml", 95),
    ("Pastas", "Espagueti Milano 200 Gr", "MILANO", "200 Gr", 65),
    ("Pastas", "Coditos Ronzoni 16 Oz", "RONZONI", "16 Oz", 145),
    ("Salsas", "Salsa De Tomate Baldom 8 Oz", "BALDOM", "8 Oz", 85),
    ("Salsas", "Ketchup Heinz 20 Oz", "HEINZ", "20 Oz", 265),
    ("Condimentos & Especias", "Sazón Ranchero Baldom 100 Gr", "BALDOM", "100 Gr", 78),
    ("Condimentos & Especias", "Sal Refinada Iodada Sal Marina 1 Lb", "SAL MARINA", "1 Lb", 42),
    ("Endulzantes", "Azúcar Crema Cristal 5 Lb", "CRISTAL", "5 Lb", 285),
    ("Endulzantes", "Azúcar Refinada Cristal 2 Lb", "CRISTAL", "2 Lb", 135),
    ("Harinas", "Harina De Trigo Blanquita 5 Lb", "BLANQUITA", "5 Lb", 195),
    ("Desayuno & Cereal", "Avena En Hojuelas Quaker 18 Oz", "QUAKER", "18 Oz", 275),
    ("Desayuno & Cereal", "Corn Flakes Kellogg's 12 Oz", "KELLOGGS", "12 Oz", 385),
    ("Enlatados & Conservas", "Atún En Aceite Calvo 5 Oz", "CALVO", "5 Oz", 118),
    ("Enlatados & Conservas", "Sardinas En Salsa De Tomate Brunswick 106 Gr", "BRUNSWICK", "106 Gr", 82),
    ("Leches Condensadas & Evaporadas", "Leche Evaporada Carnation 12 Oz", "CARNATION", "12 Oz", 128),
    ("Leches Condensadas & Evaporadas", "Leche Condensada La Lechera 14 Oz", "LA LECHERA", "14 Oz", 235),
    ("Caldos & Sopas", "Caldo De Pollo Maggi 8 Cubos", "MAGGI", "8 Un", 88),
    ("Untables & Mermeladas", "Mantequilla De Maní Peter Pan 16 Oz", "PETER PAN", "16 Oz", 345),

    # ── Carnes & Pescados ───────────────────────────────────────────────────────────────────
    ("Pollo", "Pechuga De Pollo Sin Hueso Pollo Cibao 1 Lb", "POLLO CIBAO", "1 Lb", 185),
    ("Pollo", "Muslo De Pollo Pollo Cibao 1 Lb", "POLLO CIBAO", "1 Lb", 125),
    ("Pollo", "Pollo Entero Fresco Pollo Cibao 3 Lb", "POLLO CIBAO", "3 Lb", 420),
    ("Res", "Carne Molida De Res Especial 1 Lb", "CARNICERIA", "1 Lb", 265),
    ("Res", "Bistec De Res Palomilla 1 Lb", "CARNICERIA", "1 Lb", 385),
    ("Cerdo", "Chuleta De Cerdo Ahumada 1 Lb", "CARNICERIA", "1 Lb", 235),
    ("Pescados & Mariscos", "Filete De Tilapia Congelado 1 Lb", "MAR AZUL", "1 Lb", 295),
    ("Pescados & Mariscos", "Camarón Pelado Congelado 1 Lb", "MAR AZUL", "1 Lb", 685),

    # ── Lácteos & Huevos ────────────────────────────────────────────────────────────────────
    ("Leche Entera & Descremada", "Leche Entera Rica 1 Lt", "RICA", "1 Lt", 138),
    ("Leche Entera & Descremada", "Leche Deslactosada Rica 1 Lt", "RICA", "1 Lt", 152),
    ("Leche Entera & Descremada", "Leche En Polvo Nido Fortificada 400 Gr", "NIDO", "400 Gr", 585),
    ("Huevos", "Huevos Blancos Grandes Cartón 30 Un", "AVICOLA", "30 Un", 385),
    ("Queso", "Queso Cheddar Rebanado Kraft 200 Gr", "KRAFT", "200 Gr", 425),
    ("Queso", "Queso De Freír Sosúa 1 Lb", "SOSUA", "1 Lb", 345),
    ("Yogurt", "Yogurt Natural Yoplait 150 Gr", "YOPLAIT", "150 Gr", 68),
    ("Mantequilla & Margarina", "Margarina Rica 1 Lb", "RICA", "1 Lb", 195),

    # ── Bebidas ─────────────────────────────────────────────────────────────────────────────
    ("Agua", "Agua Purificada Planeta Azul 1 Gl", "PLANETA AZUL", "1 Gl", 85),
    ("Agua", "Agua Mineral Dasani 600 Ml", "DASANI", "600 Ml", 45),
    ("Refresco", "Refresco Coca-Cola 2 Lt", "COCA-COLA", "2 Lt", 145),
    ("Refresco", "Refresco Country Club Merengue 2 Lt", "COUNTRY CLUB", "2 Lt", 118),
    ("Jugo", "Jugo De Naranja Rica 1 Lt", "RICA", "1 Lt", 148),
    ("Maltas", "Malta Morena 12 Oz", "MORENA", "12 Oz", 68),
    ("Bebidas Hidratantes", "Bebida Hidratante Gatorade 600 Ml", "GATORADE", "600 Ml", 95),

    # ── Bebés ───────────────────────────────────────────────────────────────────────────────
    ("Pañales & Toallitas De Bebé", "Pañales Pampers Baby Dry Etapa 3 44 Un", "PAMPERS", "44 Un", 1285),
    ("Pañales & Toallitas De Bebé", "Toallitas Húmedas Huggies 184 Un", "HUGGIES", "184 Un", 585),
    ("Compotas & Papillas De Bebé", "Compota De Manzana Gerber 113 Gr", "GERBER", "113 Gr", 78),
    ("Cuidado & Aseo Del Bebé", "Shampoo Para Bebé Johnson's 200 Ml", "JOHNSONS", "200 Ml", 285),
    ("Detergente Infantil De Bebé", "Detergente Líquido Infantil Ensueño 1 Lt", "ENSUENO", "1 Lt", 315),

    # ── Cuidado Del Hogar ───────────────────────────────────────────────────────────────────
    ("Detergentes & Suavizantes", "Detergente En Polvo Ace 1 Kg", "ACE", "1 Kg", 315),
    ("Detergentes & Suavizantes", "Suavizante Downy 800 Ml", "DOWNY", "800 Ml", 285),
    ("Limpieza Del Hogar", "Cloro Clorox 1 Gl", "CLOROX", "1 Gl", 245),
    ("Limpieza Del Hogar", "Desinfectante Mistolín Lavanda 1 Gl", "MISTOLIN", "1 Gl", 285),
    ("Limpieza Del Hogar", "Jabón De Cuaba Candado 400 Gr", "CANDADO", "400 Gr", 68),
    ("Papel & Desechables", "Papel Higiénico Scott 12 Rollos", "SCOTT", "12 Un", 485),
    ("Papel & Desechables", "Servilletas Nevax 200 Un", "NEVAX", "200 Un", 125),
    ("Cocina & Comedor", "Fundas Plásticas Para Basura 30 Un", "HEFTY", "30 Un", 215),

    # ── Cuidado Personal ────────────────────────────────────────────────────────────────────
    ("Cuidado Bucal", "Pasta Dental Colgate Triple Acción 150 Ml", "COLGATE", "150 Ml", 165),
    ("Cuidado Capilar", "Shampoo Head & Shoulders 400 Ml", "HEAD & SHOULDERS", "400 Ml", 445),
    ("Higiene Personal", "Jabón De Baño Protex 110 Gr", "PROTEX", "110 Gr", 78),
    ("Higiene Personal", "Desodorante Rexona Men 150 Ml", "REXONA", "150 Ml", 285),
    ("Higiene Íntima", "Toallas Sanitarias Nosotras Normal 10 Un", "NOSOTRAS", "10 Un", 128),
    ("Afeitado & Depilación", "Máquina De Afeitar Gillette Prestobarba 5 Un", "GILLETTE", "5 Un", 245),

    # ── Frutas & Verduras ───────────────────────────────────────────────────────────────────
    ("Frutas Frescas", "Guineo Maduro 1 Lb", "PRODUCE", "1 Lb", 38),
    ("Frutas Frescas", "Aguacate Criollo 1 Un", "PRODUCE", "1 Un", 95),
    ("Vegetales Frescos", "Cebolla Roja 1 Lb", "PRODUCE", "1 Lb", 68),
    ("Vegetales Frescos", "Tomate Barceló 1 Lb", "PRODUCE", "1 Lb", 55),
    ("Víveres", "Plátano Verde 1 Un", "PRODUCE", "1 Un", 22),
    ("Víveres", "Yuca Fresca 1 Lb", "PRODUCE", "1 Lb", 45),
    ("Víveres", "Batata 1 Lb", "PRODUCE", "1 Lb", 42),

    # ── Panadería & Tortillería ─────────────────────────────────────────────────────────────
    ("Pan", "Pan De Agua Fresco 1 Un", "PANADERIA", "1 Un", 18),
    ("Pan", "Pan De Sándwich Bimbo 680 Gr", "BIMBO", "680 Gr", 245),
    ("Bizcochos & Bizcochitos", "Bizcocho De Vainilla Porción 1 Un", "REPOSTERIA", "1 Un", 145),
    ("Tortillas", "Tortillas De Harina Mission 10 Un", "MISSION", "10 Un", 265),

    # ── Embutidos & Delicatessen ────────────────────────────────────────────────────────────
    ("Salami", "Salami Induveca Especial 1 Lb", "INDUVECA", "1 Lb", 285),
    ("Jamón", "Jamón De Pierna Induveca 200 Gr", "INDUVECA", "200 Gr", 195),
    ("Salchichas", "Salchichas Induveca 12 Un", "INDUVECA", "12 Un", 215),
    ("Longaniza", "Longaniza Criolla 1 Lb", "INDUVECA", "1 Lb", 325),

    # ── Congelados ──────────────────────────────────────────────────────────────────────────
    ("Helados", "Helado De Vainilla Bon 1 Lt", "BON", "1 Lt", 385),
    ("Papas & Frituras", "Papas Fritas Congeladas McCain 1 Kg", "MCCAIN", "1 Kg", 425),
    ("Vegetales Congelados", "Vegetales Mixtos Congelados Goya 16 Oz", "GOYA", "16 Oz", 185),
    ("Pizzas & Empanadas", "Pizza Congelada Pepperoni 400 Gr", "DELIZIA", "400 Gr", 465),

    # ── Snacks & Dulces ─────────────────────────────────────────────────────────────────────
    ("Snacks Salados & Picaderas", "Papitas Fritas Lay's 150 Gr", "LAYS", "150 Gr", 215),
    ("Chocolates & Caramelos", "Chocolate Snickers 52 Gr", "SNICKERS", "52 Gr", 95),
    ("Dulces Típicos", "Dulce De Leche Cortado 250 Gr", "DULCERIA", "250 Gr", 165),
    ("Galletas & Barras", "Galletas Oreo 154 Gr", "OREO", "154 Gr", 145),

    # ── Mascotas ────────────────────────────────────────────────────────────────────────────
    ("Alimento Para Perro", "Alimento Para Perro Dog Chow Adulto 4 Lb", "DOG CHOW", "4 Lb", 585),
    ("Alimento Para Gato", "Alimento Para Gato Whiskas Adulto 1 Kg", "WHISKAS", "1 Kg", 485),
    ("Arena Sanitaria", "Arena Sanitaria Para Gato 4 Kg", "TIDY CATS", "4 Kg", 545),

    # ── Salud & Farmacia ────────────────────────────────────────────────────────────────────
    ("Medicinas", "Acetaminofén 500 Mg 20 Tabletas", "GENERICO", "20 Un", 85),
    ("Vitaminas & Suplementos", "Vitamina C 1000 Mg 30 Tabletas", "GENERICO", "30 Un", 285),
    ("Primeros Auxilios", "Alcohol Isopropílico 70% 500 Ml", "GENERICO", "500 Ml", 95),

    # ── Alcohol ─────────────────────────────────────────────────────────────────────────────
    ("Cerveza", "Cerveza Presidente 12 Oz", "PRESIDENTE", "12 Oz", 125),
    ("Ron", "Ron Brugal Añejo 750 Ml", "BRUGAL", "750 Ml", 685),
    ("Vino", "Vino Tinto Concha Y Toro 750 Ml", "CONCHA Y TORO", "750 Ml", 795),

    # ── Comidas Preparadas ──────────────────────────────────────────────────────────────────
    ("Rotisería", "Pollo Horneado Entero Listo 1 Un", "ROTISERIA", "1 Un", 585),
    ("Sándwiches & Wraps", "Sándwich De Jamón Y Queso 1 Un", "DELI", "1 Un", 185),

    # ── Escolares & Oficina ─────────────────────────────────────────────────────────────────
    ("Cuadernos & Agendas", "Cuaderno Rayado 100 Hojas 1 Un", "NORMA", "100 Un", 85),
    ("Escritura", "Bolígrafos Azules Bic 10 Un", "BIC", "10 Un", 125),

    # ═══════════════════════════════════════════════════════════════════════════════════════
    # TANDA 2 — cierre de los huecos de `basket_query`.
    # No se eligieron a ojo: se midió qué queries de la canasta del hogar (213, en 20 grupos) NO
    # devolvían NINGÚN producto, y esto es exactamente esa lista. Sin este bloque, la canasta por
    # presupuesto omitiría rubros enteros y el agente lo reportaría como "no hay oferta" cuando en
    # realidad era un hueco del catálogo de prueba.
    # ═══════════════════════════════════════════════════════════════════════════════════════

    # Salsas y condimentos
    ("Salsas", "Mayonesa Hellmann's 15 Oz", "HELLMANNS", "15 Oz", 285),
    ("Salsas", "Mostaza French's 12 Oz", "FRENCHS", "12 Oz", 165),
    ("Salsas", "Salsa Inglesa Lea & Perrins 5 Oz", "LEA & PERRINS", "5 Oz", 195),
    ("Salsas", "Salsa China La Cigüeña 10 Oz", "LA CIGUENA", "10 Oz", 115),
    ("Condimentos & Especias", "Sazón Con Culantro Y Achiote Goya 8 Un", "GOYA", "8 Un", 78),
    ("Condimentos & Especias", "Sazón Completa Maggi 100 Gr", "MAGGI", "100 Gr", 92),
    ("Condimentos & Especias", "Pimienta Negra Molida Baldom 45 Gr", "BALDOM", "45 Gr", 88),
    ("Condimentos & Especias", "Curry En Polvo Badia 55 Gr", "BADIA", "55 Gr", 105),
    ("Condimentos & Especias", "Hojas De Laurel Badia 8 Gr", "BADIA", "8 Gr", 65),
    ("Condimentos & Especias", "Orégano Molido Badia 40 Gr", "BADIA", "40 Gr", 78),

    # Limpieza
    ("Limpieza Del Hogar", "Jabón De Lavar Zote 400 Gr", "ZOTE", "400 Gr", 75),
    ("Limpieza Del Hogar", "Limpiador Multiusos Fabuloso 1 Lt", "FABULOSO", "1 Lt", 165),
    ("Limpieza Del Hogar", "Lavaplatos Líquido Axion 750 Ml", "AXION", "750 Ml", 195),
    ("Limpieza Del Hogar", "Esponja Para Lavar Platos 3 Un", "SCOTCH BRITE", "3 Un", 95),
    ("Limpieza Del Hogar", "Ambientador Glade Lavanda 400 Ml", "GLADE", "400 Ml", 215),
    ("Control De Plagas", "Insecticida Raid Mata Insectos 400 Ml", "RAID", "400 Ml", 285),

    # Higiene personal
    ("Cuidado Bucal", "Cepillo De Dientes Oral-B 2 Un", "ORAL-B", "2 Un", 145),
    ("Cuidado Bucal", "Enjuague Bucal Listerine 500 Ml", "LISTERINE", "500 Ml", 385),
    ("Cuidado Capilar", "Acondicionador Pantene 400 Ml", "PANTENE", "400 Ml", 415),
    ("Higiene Personal", "Algodón En Bolas 100 Un", "GENERICO", "100 Un", 85),
    ("Higiene Personal", "Cotonetes Q-Tips 100 Un", "Q-TIPS", "100 Un", 118),
    ("Higiene Íntima", "Protector Diario Nosotras 20 Un", "NOSOTRAS", "20 Un", 105),

    # Enlatados y conservas
    ("Enlatados & Conservas", "Atún En Agua Ademar 5 Oz", "ADEMAR", "5 Oz", 98),
    ("Enlatados & Conservas", "Maíz Dulce Enlatado Goya 15 Oz", "GOYA", "15 Oz", 105),
    ("Enlatados & Conservas", "Piña En Almíbar Dole 20 Oz", "DOLE", "20 Oz", 175),
    ("Enlatados & Conservas", "Duraznos En Almíbar Del Monte 15 Oz", "DEL MONTE", "15 Oz", 195),
    ("Enlatados & Conservas", "Champiñones Enlatados Goya 8 Oz", "GOYA", "8 Oz", 145),
    ("Enlatados & Conservas", "Paté De Hígado Underwood 4 Oz", "UNDERWOOD", "4 Oz", 128),

    # Pastas
    ("Pastas", "Spaghetti Rica 200 Gr", "RICA", "200 Gr", 68),
    ("Pastas", "Lasagna Ronzoni 16 Oz", "RONZONI", "16 Oz", 285),
    ("Pastas", "Macarrones Milano 200 Gr", "MILANO", "200 Gr", 62),
    ("Pastas", "Fideos Vermicelli Milano 200 Gr", "MILANO", "200 Gr", 58),

    # Harinas y horneo
    ("Repostería", "Polvo De Hornear Royal 100 Gr", "ROYAL", "100 Gr", 95),
    ("Repostería", "Levadura Seca Fleischmann 11 Gr", "FLEISCHMANN", "11 Gr", 48),
    ("Repostería", "Esencia De Almendra Baldom 60 Ml", "BALDOM", "60 Ml", 78),

    # Embutidos
    ("Charcutería", "Mortadela Induveca 1 Lb", "INDUVECA", "1 Lb", 165),
    ("Charcutería", "Tocineta Ahumada Induveca 12 Oz", "INDUVECA", "12 Oz", 285),
    ("Charcutería", "Butifarra Criolla 1 Lb", "INDUVECA", "1 Lb", 245),

    # Víveres y vegetales
    ("Víveres", "Yautía Amarilla 1 Lb", "PRODUCE", "1 Lb", 65),
    ("Vegetales Frescos", "Chayote 1 Un", "PRODUCE", "1 Un", 35),
    ("Vegetales Frescos", "Berenjena 1 Un", "PRODUCE", "1 Un", 42),

    # Café, endulzantes, lácteos, bebidas, bebé, cereales, panadería
    ("Café", "Café Molido Cerro Dorado 1 Lb", "CERRO DORADO", "1 Lb", 465),
    ("Café", "Café Molido Lorenzo 1 Lb", "LORENZO", "1 Lb", 435),
    ("Endulzantes", "Miel De Abeja Pura 12 Oz", "APICOLA", "12 Oz", 385),
    ("Endulzantes", "Endulzante Splenda 50 Sobres", "SPLENDA", "50 Un", 285),
    ("Queso", "Queso Crema Philadelphia 8 Oz", "PHILADELPHIA", "8 Oz", 345),
    ("Queso", "Requesón Fresco 1 Lb", "SOSUA", "1 Lb", 225),
    ("Bebidas Energéticas", "Bebida Energizante Red Bull 250 Ml", "RED BULL", "250 Ml", 165),
    ("Biberones & Chupetes", "Biberón Anticólico Avent 260 Ml", "AVENT", "260 Ml", 685),
    ("Desayuno & Cereal", "Cereal Cheerios 12 Oz", "CHEERIOS", "12 Oz", 425),
    ("Bizcochos & Bizcochitos", "Donas Glaseadas 6 Un", "PANADERIA", "6 Un", 195),
]

# Desvío por tienda respecto del precio base, en puntos porcentuales. Se ROTA por producto para
# que el más barato cambie: si un solo súper ganara siempre, el comparador no tendría nada que
# comparar y la tool `cheapest_store_by_category` mentiría por construcción.
_SPREADS = (
    (-6, +2, +7),   # gana Bravo
    (+5, -7, +1),   # gana Sirena
    (+3, +8, -5),   # gana Nacional
    (-3, +6, -1),   # gana Bravo por poco
    (+9, -2, -6),   # gana Nacional
)


def _price_minor(base_major: int, name: str, provider_index: int) -> int:
    """Precio DETERMINISTA en minor units. Entero de punta a punta — nunca float."""
    digest = blake2b(name.encode(), digest_size=2).digest()
    spread = _SPREADS[int.from_bytes(digest, "big") % len(_SPREADS)][provider_index]
    base_minor = base_major * 100
    return base_minor + (base_minor * spread) // 100


def _provider_ids(session) -> dict[str, str]:  # type: ignore[no-untyped-def]
    rows = session.execute(
        text("select id, name from save.provider where market_id = :m"), {"m": MARKET}
    ).all()
    found = {r.name: str(r.id) for r in rows if r.name in PROVIDERS}
    missing = set(PROVIDERS) - set(found)
    if missing:
        sys.exit(f"Faltan proveedores en la base: {sorted(missing)}")
    return found


def _leaf_ids(session) -> dict[str, str]:  # type: ignore[no-untyped-def]
    rows = session.execute(
        text("select id, name from save.taxonomy_node")
    ).all()
    return {r.name: str(r.id) for r in rows}


def purge() -> None:
    with SessionLocal() as s:
        deleted = s.execute(
            text(
                """
                delete from save.product_match
                 where store_product_id in (
                   select id from save.store_product where external_id like :p
                 )
                """
            ),
            {"p": f"{DEMO_PREFIX}%"},
        ).rowcount
        s.execute(
            text("delete from save.price where store_product_id in "
                 "(select id from save.store_product where external_id like :p)"),
            {"p": f"{DEMO_PREFIX}%"},
        )
        sp = s.execute(
            text("delete from save.store_product where external_id like :p"),
            {"p": f"{DEMO_PREFIX}%"},
        ).rowcount
        s.commit()
        print(f"purge: {sp} store_product y {deleted} product_match borrados.")
        print("Los canonical_product NO se borran (pueden tener otros enlaces). "
              "Bórralos a mano si hace falta.")


def seed() -> None:
    now = datetime.now(timezone.utc)
    created_canonicals = created_stores = skipped = 0

    with SessionLocal() as s:
        providers = _provider_ids(s)
        leaves = _leaf_ids(s)
        crepo = SqlCanonicalProductRepository(s)
        srepo = SqlStoreProductRepository(s)
        mrepo = SqlProductMatchRepository(s)

        unknown_leaves = {leaf for leaf, *_ in PRODUCTS if leaf not in leaves}
        if unknown_leaves:
            print(f"⚠ hojas de taxonomía inexistentes (se omiten): {sorted(unknown_leaves)}")

        for leaf, name, brand, size_text, base_major in PRODUCTS:
            node_id = leaves.get(leaf)
            if node_id is None:
                skipped += 1
                continue

            existing = s.execute(
                text(
                    "select id from save.canonical_product "
                    " where name = :n and market_id = :m and archived_at is null"
                ),
                {"n": name, "m": MARKET},
            ).first()
            if existing:
                canonical_id = str(existing.id)
            else:
                canonical_id = str(uuid.uuid4())
                crepo.add(
                    CanonicalProduct(
                        canonical_id,
                        name,
                        brand,
                        parse_size(size_text),
                        taxonomy_node_id=node_id,
                        market_id=MARKET,
                        display_size=size_text,
                    )
                )
                created_canonicals += 1

            for index, provider_name in enumerate(PROVIDERS):
                external_id = f"{DEMO_PREFIX}{blake2b(name.encode(), digest_size=6).hexdigest()}"
                store_product_id = srepo.record_observation(
                    provider_id=providers[provider_name],
                    external_id=external_id,
                    canonical_product_id=canonical_id,
                    price=Money(_price_minor(base_major, name, index), DOP),
                    captured_at=now,
                    price_type=PriceType.ONLINE,
                    source="demo_seed",
                    name=name,
                    brand=brand,
                    size_text=size_text,
                    source_category=leaf,
                )
                srepo.link_to_canonical(store_product_id, canonical_id)
                mrepo.record_match(
                    store_product_id=store_product_id,
                    canonical_product_id=canonical_id,
                    confidence=1.0,
                    method="ean",       # datos sembrados: enlace determinista, no probabilístico
                    status="auto_linked",
                )
                created_stores += 1

        s.commit()

    print(
        f"seed: {created_canonicals} canónicos nuevos · {created_stores} store_product enlazados "
        f"en {len(PROVIDERS)} proveedores · {skipped} omitidos por hoja inexistente"
    )
    print("Siguiente paso OBLIGATORIO (o la búsqueda semántica no los ve):")
    print("    cd apps/api && uv run python -m seeds.embed_backfill")


if __name__ == "__main__":
    if "--purge" in sys.argv:
        purge()
    else:
        seed()

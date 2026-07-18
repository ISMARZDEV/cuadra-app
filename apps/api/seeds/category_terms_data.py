"""Descriptores del dominio (bootstrap curado) por hoja de taxonomía — mercado DO.

Data, no código: alimenta la receta de embedding del clasificador (`build_category_embedding_text`)
para separar clases que una etiqueta corta apiña. Validado a escala (120 hojas × 30 productos):
**top-1 43%→77%**. Es el arranque determinista, sin cuota; para hojas nuevas / regeneración está el
CLI LLM `seeds.generate_category_terms`. Editable después desde el admin (curación humana).

Clave = nombre EXACTO de la hoja (level=1). `seed_category_terms` aplica los términos a TODAS las
hojas del market con ese nombre (p.ej. "Maternidad & Lactancia" existe bajo Bebés y bajo Salud).
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

CATEGORY_TERMS: dict[str, str] = {
    # Alcohol
    "Brandy / Cognac": "brandy, coñac, destilado de uva añejado",
    "Cerveza": "cerveza, birra, presidente, brahma, six pack de cerveza",
    "Cigarrillos": "cigarrillos, tabaco, marlboro, nacional de cigarros",
    "Espumantes / Champagne": "champagne, vino espumante, prosecco, cava",
    "Ginebra": "ginebra, gin, bombay, tanqueray",
    "Hard Seltzer": "hard seltzer, agua carbonatada alcohólica saborizada",
    "Licor": "licor, crema de licor, aguardiente, anís, amaretto",
    "Mamajuana": "mamajuana, bebida dominicana de raíces y hierbas en ron",
    "Ron": "ron, brugal, barceló, bermúdez, ron añejo dominicano",
    "Sangría": "sangría, vino preparado con frutas",
    "Sidra": "sidra, bebida de manzana fermentada",
    "Tequila": "tequila, mezcal, jose cuervo",
    "Vino": "vino tinto, vino blanco, vino rosado, botella de vino",
    "Vodka": "vodka, smirnoff, absolut",
    "Whisky": "whisky, whiskey, escocés, buchanans, johnnie walker",
    # Bebés
    "Accesorios De Bebé": "accesorios de bebé, biberones, chupetes, teteros, baberos",
    "Alimentos Para Bebé": "compota, papilla, fórmula infantil, cereal de bebé, nestlé nan",
    "Cuidado & Aseo Del Bebé": "shampoo de bebé, jabón de bebé, colonia infantil, crema antipañalitis",
    "Juguetes & Muebles Del Bebé": "juguetes de bebé, corral, coche, silla de comer",
    "Lavado De Ropa De Bebé": "detergente para ropa de bebé, jabón suave infantil",
    "Maternidad & Lactancia": "lactancia, extractor de leche, protectores de lactancia, faja postparto, suplementos de embarazo",
    "Pañales & Toallitas De Bebé": "pañales, toallitas húmedas, pampers, huggies",
    # Bebidas
    "Agua": "agua purificada, agua mineral, botellón de agua, agua embotellada, planeta azul",
    "Bebidas Energéticas": "bebida energética, red bull, monster",
    "Bebidas En Polvo": "bebida en polvo, tang, kool aid, refresco en polvo",
    "Bebidas Hidratantes": "bebida hidratante, gatorade, powerade, suero oral",
    "Jugo": "jugo de naranja, jugo de frutas, néctar, rica jugo",
    "Maltas": "malta, malta morena, bebida de malta sin alcohol",
    "Refresco": "refresco, gaseosa, coca cola, pepsi, sprite, country club",
    "Té Líquido": "té frío embotellado, té helado, lipton ice tea",
    # Carnes & Pescados
    "Albóndigas": "albóndigas de carne, bolitas de carne molida",
    "Aves & Carnes Especiales": "pato, conejo, codorniz, carnes exóticas, chivo",
    "Carnes Congeladas": "carne congelada, cortes congelados de res o cerdo",
    "Cerdo": "cerdo, chuleta, costilla de cerdo, puerco, lomo de cerdo",
    "Chimi": "chimichurri dominicano, sándwich de chimi, carne para chimi",
    "Hamburguesas": "hamburguesas, carne para hamburguesa, patties",
    "Pavo": "pavo, pechuga de pavo, pavo entero",
    "Pescados & Mariscos": "pescado, camarones, langosta, bacalao, mariscos, filete de pescado",
    "Pollo": "pollo entero, pechuga de pollo, muslo, alitas, pollo fresco",
    "Res": "carne de res, res molida, bistec, churrasco, costilla de res",
    "Sustituto De Carne": "sustituto de carne, proteína vegetal, carne vegana, tofu",
    # Cuidado Del Hogar
    "Cocina & Comedor": "utensilios de cocina, ollas, sartenes, vajilla, cubiertos",
    "Control De Plagas": "insecticida, raid, veneno para cucarachas, trampa de ratones",
    "Cuidado De Calzado": "betún, limpiador de zapatos, cepillo de calzado",
    "Eléctricos Del Hogar": "bombillos, extensiones eléctricas, pilas, baterías, duracell",
    "Lavado De Ropa": "detergente de ropa, suavizante, cloro, pañitos de secadora, downy, ace",
    "Limpieza Del Hogar": "limpiador multiusos, desinfectante, mistolín, fabuloso, escoba, trapeador, ambientador",
    "Papel & Desechables": "papel higiénico, servilletas, toalla de papel, vasos y platos desechables, foil",
    "Parrilla & Encendido": "carbón, fósforos, encendedor, líquido de encender",
    # Cuidado Personal
    "Accesorios De Baño": "accesorios de baño, esponja, cortina de baño, jabonera",
    "Afeitado & Depilación": "afeitadora, cuchillas, crema de afeitar, cera depilatoria, gillette",
    "Cuidado Capilar": "shampoo, acondicionador, tinte de cabello, tratamiento capilar",
    "Cuidado Corporal": "jabón de baño, crema corporal, desodorante, loción",
    "Cuidado Facial": "crema facial, limpiador de rostro, protector solar",
    "Higiene Íntima": "toallas sanitarias, tampones, protectores diarios, jabón íntimo",
    "Higiene Personal": "pasta dental, cepillo de dientes, enjuague bucal, hisopos, desodorante",
    "Maquillaje": "maquillaje, labial, base, rímel, esmalte de uñas",
    "Repelente": "repelente de mosquitos, off, espiral antimosquitos",
    # Despensa & Abarrotes
    "Aceite & Vinagre": "aceite de oliva, aceite vegetal, vinagre, aceite de maíz, mazola",
    "Arroz, Granos & Legumbres": "arroz blanco e integral, habichuelas rojas negras pintas y blancas, frijoles, guandules, lentejas, garbanzos, granos secos, legumbres",
    "Café": "café molido, café en grano, café instantáneo, santo domingo, induban",
    "Caldos & Sopas": "caldo de pollo, cubitos, sopa instantánea, maggi, knorr, ramen",
    "Chocolate Para Beber": "chocolate en polvo, cocoa, chocolate de mesa, nesquik",
    "Condimentos & Especias": "sazón, orégano, comino, ajo en polvo, adobo, especias, sal",
    "Desayuno & Cereal": "cereal de desayuno, avena, corn flakes, granola, zucaritas",
    "Endulzantes": "azúcar, edulcorante, splenda, stevia, miel de abeja",
    "Enlatados & Conservas": "atún en lata, sardinas, maíz dulce enlatado, vegetales en conserva, espárragos en lata, salchichas enlatadas",
    "Harinas": "harina de trigo, harina de maíz, maicena, harina para hacer pan",
    "Pastas": "espagueti, coditos, fideos, macarrones, pasta seca, lasaña",
    "Repostería": "polvo de hornear, esencia de vainilla, chispas de chocolate, fondant, decoración de bizcocho",
    "Salsas": "salsa de tomate, ketchup, mayonesa, mostaza, salsa china, soya, salsa picante",
    "Semillas & Frutos Secos": "maní, almendras, nueces, pasas, semillas de girasol, merey",
    "Té & Infusiones": "té en bolsitas, manzanilla, tila, infusión de hierbas, té verde",
    # Embutidos & Delicatessen
    "Charcutería": "charcutería, embutidos surtidos, fiambres, mortadela",
    "Jamón": "jamón, jamón cocido, jamón serrano, lonjas de jamón",
    "Longaniza": "longaniza, chorizo dominicano",
    "Salami": "salami, salchichón, salami dominicano, induveca",
    "Salchichas": "salchichas, hot dogs, vienna sausage, frankfurter",
    # Escolares & Oficina
    "Accesorios Escolares": "mochila, cartuchera, lonchera escolar",
    "Arte & Manualidades": "crayones, pinturas, pinceles, plastilina, foamy",
    "Cuadernos & Agendas": "cuaderno, libreta, agenda, block de notas",
    "Escritura": "lápiz, bolígrafo, marcador, resaltador, borrador",
    "Herramientas De Oficina & Geometría": "regla, compás, calculadora, grapadora, perforadora",
    "Libros": "libros, textos escolares, diccionario",
    "Papelería Escolar & Oficina": "papel bond, folders, sobres, carpetas, resma de papel",
    "Pegamentos & Cintas": "pegamento, goma de pegar, cinta adhesiva, teipe, silicón",
    # Frutas & Verduras
    "Ensaladas": "ensalada preparada, mezcla de lechugas, ensalada empacada",
    "Frutas": "manzana, guineo, naranja, uva, piña, mango, fresa, limón, mandarina, fruta fresca",
    "Frutas Deshidratadas": "frutas secas, pasas, ciruela pasa, mango deshidratado",
    "Hierbas Frescas": "cilantro, perejil, albahaca, apio, hierbabuena, recao",
    "Pulpa De Frutas": "pulpa de fruta congelada, pulpa de chinola, pulpa de guayaba",
    "Vegetales": "vegetales frescos, zanahoria, cebolla, tomate, lechuga, ají, brócoli, repollo",
    "Víveres": "víveres dominicanos, yuca, plátano, batata, ñame, yautía, guineo verde, tubérculos",
    # Lácteos & Huevos
    "Crema Agria": "crema agria, crema de leche, sour cream",
    "Huevos": "huevos, cartón de huevos, huevo blanco",
    "Leche": "leche entera, leche descremada, leche uht, leche evaporada, leche en polvo, rica leche",
    "Mantequilla & Margarina": "mantequilla, margarina, mantequilla de maní",
    "Queso": "queso mozzarella, queso de freír, queso cheddar, queso crema, queso rallado",
    "Yogurt": "yogurt, yogur bebible, yoplait, griego",
    # Mascotas
    "Accesorios Para Mascotas": "correa, collar, plato para mascota, juguete de mascota",
    "Alimento Para Gato": "comida para gato, alimento felino, whiskas, croquetas de gato",
    "Alimento Para Perro": "comida para perro, croquetas caninas, galletas para perro, pedigree, dog chow, snacks caninos",
    "Arena Para Gato": "arena sanitaria para gato, litter",
    "Higiene Para Mascotas": "shampoo para mascotas, antipulgas, toallitas para mascotas",
    "Otras Mascotas": "alimento para aves, peces, hámster, acuario",
    # Panadería & Tortillería
    "Bizcochos & Bizcochitos": "bizcocho, ponqué, panquecito, brownie, muffin",
    "Discos De Masa": "discos de masa para empanada, masa para pastelitos, hojaldre",
    "Masa De Pizza": "masa de pizza, base de pizza prehorneada",
    "Pan": "pan de agua, pan sobao, pan de sándwich, baguette, pan integral",
    "Tortillas": "tortillas de maíz, tortillas de harina, wraps, tostadas mexicanas",
    # Salud & Farmacia
    "Medicinas": "acetaminofén, ibuprofeno, jarabe para la tos, antigripal, antiácido",
    "Primeros Auxilios": "curitas, gasa, alcohol, agua oxigenada, vendas, termómetro",
    "Vitaminas & Suplementos": "vitaminas, multivitamínico, proteína en polvo, colágeno, omega 3",
    # Snacks & Dulces
    "Chocolates & Caramelos": "chocolates, bombones, caramelos, gomitas, chicles",
    "Dulces Típicos": "dulce de leche, dulce de coco, jalea de batata, dulces típicos dominicanos",
    "Galletas & Barras": "galletas dulces, galletas de soda, barras de cereal, oreo, club social",
    "Postres Listos": "gelatina, flan, pudín, postre listo para comer",
    "Snacks Salados & Picaderas": "papitas fritas, platanitos, chicharrones, doritos, snacks salados, picaderas",
    "Tostadas & Snacks Horneados": "tostadas, casabe, galletas horneadas, snacks al horno",
}


def seed_category_terms(session: "Session", market_id: str) -> int:
    """Aplica `CATEGORY_TERMS` a las hojas del market SIN términos (por nombre). Idempotente
    (respeta hojas ya sembradas / editadas en el admin). `set_terms` invalida el embedding →
    la próxima corrida de EmbedCategories las re-embebe. Devuelve cuántas hojas sembró."""
    from src.contexts.save.infrastructure.repositories import SqlCategoryIndexRepository

    index = SqlCategoryIndexRepository(session)
    seeded = 0
    for node_id, name, _parent in index.leaves_without_terms(market_id, limit=10_000):
        terms = CATEGORY_TERMS.get(name)
        if terms:
            index.set_terms(node_id, terms)
            seeded += 1
    return seeded

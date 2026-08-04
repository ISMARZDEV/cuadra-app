"""Descriptores del dominio (bootstrap curado) por hoja de taxonomía — mercado DO.

Data, no código: alimenta la receta de embedding del clasificador (`build_category_embedding_text`)
para separar clases que una etiqueta corta apiña. Validado a escala (120 hojas × 30 productos):
**top-1 43%→77%**. Es el arranque determinista, sin cuota; para hojas nuevas / regeneración está el
CLI LLM `seeds.generate_category_terms`. Editable después desde el admin (curación humana).

Clave = **KEY del nodo** (`congelados.platos-preparados`), NO la etiqueta. El MD fuente declara la
key como IDENTIDAD y el nombre como etiqueta MUTABLE ("renombrar una etiqueta actualiza el nodo"),
así que llavear por nombre descolgaba los términos curados en cada rename — en silencio, porque un
`dict.get(name)` que falla no es un error, es un `None`. Pasó con 9 hojas (`Frutas`→`Frutas
Frescas`, `Arena Para Gato`→`Arena Sanitaria`, `Lavado De Ropa`→`Detergentes & Suavizantes`, …) y
el hueco lo tapó el CLI del LLM con términos de peor calidad, así que nadie lo notó. El guard
`tests/save/unit/test_taxonomy_seed.py` compara estas keys contra el MD y falla si divergen.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

CATEGORY_TERMS: dict[str, str] = {
    # Alcohol
    "alcohol.brandy-cognac": "brandy, coñac, destilado de uva añejado",  # Brandy / Cognac
    "alcohol.cerveza": "cerveza, birra, presidente, brahma, six pack de cerveza",  # Cerveza
    "alcohol.cigarrillos": "cigarrillos, tabaco, marlboro, nacional de cigarros",  # Cigarrillos
    "alcohol.espumantes-champagne": "champagne, vino espumante, prosecco, cava",  # Espumantes / Champagne
    "alcohol.ginebra": "ginebra, gin, bombay, tanqueray",  # Ginebra
    "alcohol.hard-seltzer": "hard seltzer, agua carbonatada alcohólica saborizada",  # Hard Seltzer
    "alcohol.licor": "licor, crema de licor, aguardiente, anís, amaretto",  # Licor
    "alcohol.mamajuana": "mamajuana, bebida dominicana de raíces y hierbas en ron",  # Mamajuana
    "alcohol.ron": "ron, brugal, barceló, bermúdez, ron añejo dominicano",  # Ron
    "alcohol.sangria": "sangría, vino preparado con frutas",  # Sangría
    "alcohol.sidra": "sidra, bebida de manzana fermentada",  # Sidra
    "alcohol.tequila": "tequila, mezcal, jose cuervo",  # Tequila
    "alcohol.vino": "vino tinto, vino blanco, vino rosado, botella de vino",  # Vino
    "alcohol.vodka": "vodka, smirnoff, absolut",  # Vodka
    "alcohol.whisky": "whisky, whiskey, escocés, buchanans, johnnie walker",  # Whisky
    # Bebés
    "bebes.alimentos-para-bebe": "compota, papilla, fórmula infantil, cereal infantil en papilla, nestlé nan",  # Compotas & Papillas De Bebé
    "bebes.biberones-chupetes": "accesorios de bebé, biberones, chupetes, teteros, baberos",  # Biberones & Chupetes
    "bebes.cuidado-aseo-del-bebe": "shampoo de bebé, jabón de baño para bebé, colonia infantil, crema antipañalitis",  # Cuidado & Aseo Del Bebé
    "bebes.detergente-de-bebe": "detergente para ropa de bebé, jabón suave infantil",  # Detergente Infantil De Bebé
    "bebes.juguetes-muebles-del-bebe": "juguetes de bebé, corral, coche, silla de comer",  # Juguetes & Muebles Del Bebé
    "bebes.maternidad-lactancia": "lactancia, extractor de leche, protectores de lactancia, suplementos de embarazo",  # Maternidad & Lactancia
    "bebes.panales-toallitas-de-bebe": "pañales, toallitas húmedas, pampers, huggies",  # Pañales & Toallitas De Bebé
    # Bebidas
    "bebidas.agua": "agua purificada, agua mineral, botellón de agua, agua embotellada, planeta azul",  # Agua
    "bebidas.bebidas-de-almendra-avena": "leche de almendra, leche de avena, bebida vegetal, leche de coco, silk, almond breeze",  # Bebidas De Almendra & Avena
    "bebidas.bebidas-energeticas": "bebida energética, red bull, monster",  # Bebidas Energéticas
    "bebidas.bebidas-en-polvo": "bebida en polvo, tang, kool aid, refresco en polvo",  # Bebidas En Polvo
    "bebidas.bebidas-hidratantes": "bebida hidratante, gatorade, powerade, suero oral",  # Bebidas Hidratantes
    "bebidas.jugo": "jugo de naranja, jugo de frutas, néctar, rica jugo",  # Jugo
    "bebidas.maltas": "malta, malta morena, bebida de malta sin alcohol",  # Maltas
    "bebidas.refresco": "refresco, gaseosa, coca cola, pepsi, sprite, country club",  # Refresco
    "bebidas.te-liquido": "té frío embotellado, té helado, lipton ice tea",  # Té Líquido
    # Carnes & Pescados
    "carnes-pescados.albondigas": "albóndigas de carne, bolitas de carne molida",  # Albóndigas
    "carnes-pescados.aves-carnes-especiales": "pato, conejo, codorniz, carnes exóticas, chivo",  # Aves & Carnes Especiales
    "carnes-pescados.carnes-congeladas": "carne congelada, cortes congelados de res o cerdo",  # Carnes Congeladas
    "carnes-pescados.cerdo": "cerdo, chuleta, costilla de cerdo, puerco, lomo de cerdo",  # Cerdo
    "carnes-pescados.chimi": "chimichurri dominicano, sándwich de chimi, carne para chimi",  # Chimi
    "carnes-pescados.hamburguesas": "hamburguesas, carne para hamburguesa, patties",  # Hamburguesas
    "carnes-pescados.pavo": "pavo, pechuga de pavo, pavo entero",  # Pavo
    "carnes-pescados.pescados-mariscos": "pescado, camarones, langosta, bacalao, mariscos, filete de pescado",  # Pescados & Mariscos
    "carnes-pescados.pollo": "pollo entero, pechuga de pollo, muslo, alitas, pollo fresco",  # Pollo
    "carnes-pescados.res": "carne de res, res molida, bistec, churrasco, costilla de res",  # Res
    "carnes-pescados.sustituto-de-carne": "sustituto de carne, proteína vegetal, carne vegana, tofu",  # Sustituto De Carne
    # Comidas Preparadas
    "comidas-preparadas.rotiseria": "pollo asado listo para comer, pollo rostizado, costillas asadas, comida caliente al peso, rotisería",  # Rotisería
    "comidas-preparadas.sandwiches-wraps": "sándwich preparado, wrap, emparedado listo, bocadillo, sub",  # Sándwiches & Wraps
    "comidas-preparadas.sushi": "sushi, roll de sushi, maki, nigiri, bandeja de sushi",  # Sushi
    # Congelados
    "congelados.helados": "helado, mantecado de helado, pinta de helado, bon helado, häagen dazs",  # Helados
    "congelados.hielo": "hielo en funda, bolsa de hielo, cubitos de hielo, hielo picado",  # Hielo
    "congelados.paletas-sorbetes": "paleta congelada, sorbete, granizado, paleta de agua, popsicle",  # Paletas & Sorbetes
    "congelados.papas-frituras": "papas congeladas, papa a la francesa congelada, croquetas de papa, frituras congeladas",  # Papas & Frituras
    "congelados.pizzas-empanadas": "pizza congelada, empanada congelada, pastelito congelado, quipe congelado",  # Pizzas & Empanadas
    "congelados.platos-preparados": "plato preparado congelado, comida congelada lista, lasaña congelada, arroz chino congelado, cena congelada",  # Platos Preparados
    "congelados.vegetales-congelados": "vegetales congelados, mezcla de vegetales congelada, maíz congelado, brócoli congelado, habichuelitas congeladas",  # Vegetales Congelados
    # Cuidado Del Hogar
    "cuidado-del-hogar.cocina-comedor": "utensilios de cocina, ollas, sartenes, vajilla, cubiertos",  # Cocina & Comedor
    "cuidado-del-hogar.control-de-plagas": "insecticida, raid, veneno para cucarachas, trampa de ratones",  # Control De Plagas
    "cuidado-del-hogar.cuidado-de-calzado": "betún, limpiador de zapatos, cepillo de calzado",  # Cuidado De Calzado
    "cuidado-del-hogar.detergentes-suavizantes": "detergente para lavar ropa, suavizante, cloro, pañitos de secadora, downy, ace",  # Detergentes & Suavizantes
    "cuidado-del-hogar.electricos-del-hogar": "bombillos, extensiones eléctricas, pilas, baterías, duracell",  # Eléctricos Del Hogar
    "cuidado-del-hogar.limpieza-del-hogar": "limpiador multiusos, desinfectante multiusos, mistolín, fabuloso, escoba, trapeador, ambientador",  # Limpieza Del Hogar
    "cuidado-del-hogar.papel-desechables": "papel higiénico, servilletas, toalla de papel, vasos y platos desechables, foil",  # Papel & Desechables
    "cuidado-del-hogar.parrilla-encendido": "carbón, fósforos, encendedor, líquido de encender",  # Parrilla & Encendido
    # Cuidado Personal
    "cuidado-personal.accesorios-de-bano": "accesorios de baño, esponja, cortina de baño, jabonera",  # Accesorios De Baño
    "cuidado-personal.afeitado-depilacion": "afeitadora, cuchillas, crema de afeitar, cera depilatoria, gillette",  # Afeitado & Depilación
    "cuidado-personal.cuidado-bucal": "pasta dental, cepillo de dientes, enjuague bucal, hilo dental, colgate, listerine",  # Cuidado Bucal
    "cuidado-personal.cuidado-capilar": "shampoo para el cabello, acondicionador, tinte de cabello, tratamiento capilar",  # Cuidado Capilar
    "cuidado-personal.cuidado-corporal": "jabón de baño, crema corporal, desodorante, loción",  # Cuidado Corporal
    "cuidado-personal.cuidado-facial": "crema facial, limpiador de rostro, protector solar",  # Cuidado Facial
    "cuidado-personal.higiene-intima": "toallas sanitarias femeninas, tampones, protectores diarios, jabón íntimo",  # Higiene Íntima
    "cuidado-personal.higiene-personal": "hisopos, algodón, talco corporal, toallitas húmedas personales",  # Higiene Personal
    "cuidado-personal.maquillaje": "maquillaje, labial, base, rímel, esmalte de uñas",  # Maquillaje
    "cuidado-personal.repelente": "repelente de mosquitos, off, espiral antimosquitos",  # Repelente
    # Despensa & Abarrotes
    "despensa-abarrotes.aceite-vinagre": "aceite de oliva, aceite vegetal, vinagre, aceite de maíz, mazola",  # Aceite & Vinagre
    "despensa-abarrotes.arroz-granos-legumbres": "arroz blanco e integral, habichuelas rojas negras pintas y blancas, frijoles, guandules, lentejas, garbanzos, granos básicos, legumbres",  # Arroz, Granos & Legumbres
    "despensa-abarrotes.cafe": "café molido, café en grano, café instantáneo, santo domingo, induban",  # Café
    "despensa-abarrotes.caldos-sopas": "caldo de pollo, cubitos, sopa instantánea, maggi, knorr, ramen",  # Caldos & Sopas
    "despensa-abarrotes.chocolate-para-beber": "chocolate en polvo, cocoa, chocolate de mesa, nesquik",  # Chocolate Para Beber
    "despensa-abarrotes.condimentos-especias": "sazón, orégano, comino, ajo en polvo, adobo, especias, sal",  # Condimentos & Especias
    "despensa-abarrotes.desayuno-cereal": "cereal de desayuno, avena, corn flakes, granola, zucaritas",  # Desayuno & Cereal
    "despensa-abarrotes.endulzantes": "azúcar, edulcorante, splenda, stevia, miel de abeja",  # Endulzantes
    "despensa-abarrotes.enlatados-conservas": "atún en lata, sardinas, maíz dulce enlatado, vegetales enlatados, espárragos en lata",  # Enlatados & Conservas
    "despensa-abarrotes.harinas": "harina de trigo, harina de maíz, maicena, harina para hacer pan",  # Harinas
    "despensa-abarrotes.leches-condensadas-evaporadas": "leche condensada, leche evaporada, carnation, nestlé condensada, lechera",  # Leches Condensadas & Evaporadas
    "despensa-abarrotes.pastas": "espagueti, coditos, fideos, macarrones, pasta seca, lasaña",  # Pastas
    "despensa-abarrotes.reposteria": "polvo de hornear, esencia de vainilla, chispas de chocolate para hornear, fondant, decoración para hornear",  # Repostería
    "despensa-abarrotes.salsas": "salsa de tomate, ketchup, mayonesa, mostaza, salsa china, soya, salsa picante",  # Salsas
    "despensa-abarrotes.semillas-frutos-secos": "maní, almendras, nueces, pasas, semillas de girasol, merey",  # Semillas & Frutos Secos
    "despensa-abarrotes.te-infusiones": "té en bolsitas, manzanilla, tila, infusión de hierbas, té verde",  # Té & Infusiones
    "despensa-abarrotes.untables-mermeladas": "mermelada, jalea, nutella, crema de avellana, untable de fruta",  # Untables & Mermeladas
    # Embutidos & Delicatessen
    "embutidos-delicatessen.charcuteria": "charcutería, embutidos surtidos, fiambres, mortadela",  # Charcutería
    "embutidos-delicatessen.jamon": "jamón, jamón cocido, jamón serrano, lonjas de jamón",  # Jamón
    "embutidos-delicatessen.longaniza": "longaniza, chorizo dominicano",  # Longaniza
    "embutidos-delicatessen.salami": "salami, salchichón, salami dominicano, induveca",  # Salami
    "embutidos-delicatessen.salchichas": "salchichas, hot dogs, vienna sausage, frankfurter",  # Salchichas
    # Escolares & Oficina
    "escolares-oficina.accesorios-escolares": "mochila, cartuchera, lonchera escolar",  # Mochilas & Útiles Escolares
    "escolares-oficina.arte-manualidades": "crayones, pinturas, pinceles, plastilina, foamy",  # Arte & Manualidades
    "escolares-oficina.cuadernos-agendas": "cuaderno, libreta, agenda, block de notas",  # Cuadernos & Agendas
    "escolares-oficina.escritura": "lápiz, bolígrafo, marcador, resaltador, borrador",  # Escritura
    "escolares-oficina.herramientas-de-oficina-geometria": "regla, compás, calculadora, grapadora, perforadora",  # Herramientas De Oficina & Geometría
    "escolares-oficina.libros": "libros, textos escolares, diccionario",  # Libros
    "escolares-oficina.papeleria-escolar-oficina": "papel bond, folders, sobres, carpetas, resma de papel",  # Papelería Escolar & Oficina
    "escolares-oficina.pegamentos-cintas": "pegamento, goma de pegar, cinta adhesiva, teipe, silicón",  # Pegamentos & Cintas
    # Frutas & Verduras
    "frutas-verduras.ensaladas": "ensalada preparada, mezcla de lechugas, ensalada empacada",  # Ensaladas
    "frutas-verduras.frutas-deshidratadas": "frutas secas, pasas, ciruela pasa, mango deshidratado",  # Frutas Deshidratadas
    "frutas-verduras.frutas-frescas": "manzana, guineo, naranja, uva, piña, mango, fresa, limón, mandarina, fruta fresca",  # Frutas Frescas
    "frutas-verduras.hierbas-aromaticas": "cilantro, perejil, albahaca, apio, hierbabuena, recao",  # Hierbas Aromáticas
    "frutas-verduras.pulpa-de-frutas": "pulpa de fruta congelada, pulpa de chinola, pulpa de guayaba",  # Pulpa De Frutas
    "frutas-verduras.vegetales-frescos": "vegetales frescos, zanahoria, cebolla, tomate, lechuga, ají, brócoli, repollo",  # Vegetales Frescos
    "frutas-verduras.viveres": "víveres dominicanos, yuca, plátano, batata, ñame, yautía, guineo verde, tubérculos",  # Víveres
    # Lácteos & Huevos
    "lacteos-huevos.crema-agria": "crema agria, crema de leche, sour cream",  # Crema Agria
    "lacteos-huevos.huevos": "huevos, cartón de huevos, huevo blanco",  # Huevos
    "lacteos-huevos.leche": "leche entera, leche descremada, leche uht, leche en polvo, rica leche",  # Leche Entera & Descremada
    "lacteos-huevos.mantequilla-margarina": "mantequilla, margarina, mantequilla de maní",  # Mantequilla & Margarina
    "lacteos-huevos.queso": "queso mozzarella, queso de freír, queso cheddar, queso crema, queso rallado",  # Queso
    "lacteos-huevos.yogurt": "yogurt, yogur bebible, yoplait, griego",  # Yogurt
    # Mascotas
    "mascotas.alimento-para-gato": "comida para gato, alimento felino, whiskas, croquetas de gato",  # Alimento Para Gato
    "mascotas.alimento-para-perro": "comida para perro, croquetas caninas, galletas para perro, pedigree, dog chow, snacks caninos",  # Alimento Para Perro
    "mascotas.arena-sanitaria": "arena sanitaria para gato, litter",  # Arena Sanitaria
    "mascotas.correas-camas": "correa, collar, plato para mascota, juguete de mascota",  # Correas & Camas
    "mascotas.otras-mascotas": "alimento para aves, peces, hámster, acuario",  # Otras Mascotas
    "mascotas.shampoo-para-mascotas": "shampoo para mascotas, antipulgas, toallitas para mascotas",  # Shampoo Para Mascotas
    # Panadería & Tortillería
    "panaderia-tortilleria.bizcochos-bizcochitos": "bizcocho, ponqué, panquecito, brownie, muffin",  # Bizcochos & Bizcochitos
    "panaderia-tortilleria.discos-de-masa": "discos de masa para empanada, masa para pastelitos, hojaldre",  # Discos De Masa
    "panaderia-tortilleria.masa-de-pizza": "masa de pizza, base de pizza prehorneada",  # Masa De Pizza & Hojaldre
    "panaderia-tortilleria.pan": "pan de agua, pan sobao, pan de sándwich, baguette, pan integral",  # Pan
    "panaderia-tortilleria.tortillas": "tortillas de maíz, tortillas de harina, wraps, tostadas mexicanas",  # Tortillas
    # Salud & Farmacia
    "salud-farmacia.cuidado-prenatal-postparto": "prueba de embarazo, ácido fólico, vitaminas prenatales, faja postparto, cuidado prenatal",  # Cuidado Prenatal & Postparto
    "salud-farmacia.medicinas": "acetaminofén, ibuprofeno, jarabe para la tos, antigripal, antiácido",  # Medicinas
    "salud-farmacia.primeros-auxilios": "curitas, gasa, alcohol antiséptico, peróxido de hidrógeno, vendas, termómetro",  # Primeros Auxilios
    "salud-farmacia.vitaminas-suplementos": "vitaminas, multivitamínico, proteína en polvo, colágeno, omega 3",  # Vitaminas & Suplementos
    # Snacks & Dulces
    "snacks-dulces.chocolates-caramelos": "chocolates, bombones, caramelos, gomitas, chicles",  # Chocolates & Caramelos
    "snacks-dulces.dulces-tipicos": "dulce de leche, dulce de coco, jalea de batata, dulces típicos dominicanos",  # Dulces Típicos
    "snacks-dulces.galletas-barras": "galletas dulces, galletas de soda, barras de cereal, oreo, club social",  # Galletas & Barras
    "snacks-dulces.postres-listos": "gelatina, flan, pudín, postre listo para comer",  # Postres Listos
    "snacks-dulces.snacks-salados-picaderas": "papitas fritas, platanitos, chicharrones, doritos, snacks salados, picaderas",  # Snacks Salados & Picaderas
    "snacks-dulces.tostadas-snacks-horneados": "tostadas, casabe, galletas horneadas, snacks al horno",  # Tostadas & Snacks Horneados
}


# Descriptores de las 17 RAÍCES (nivel 0) — el pasillo, no la góndola.
#
# ALCANCE, para que nadie se confunda leyendo esto: el clasificador NO los usa. Sus tres consultas
# (`find_leaves_vector`, `leaves_without_embedding`, `leaf_keys_without_terms`) filtran `level == 1`,
# así que una raíz nunca es candidata ni destino. Se pueblan para que la tabla esté COMPLETA y para
# que quede disponible una descripción del pasillo a quien la necesite (navegación, prompts, un
# futuro ruteo grueso por pasillo). Si algún día se levanta el filtro `level == 1`, revisar ANTES
# el efecto sobre el consenso: una raíz compite con sus propias hojas y ninguna discrimina.
ROOT_TERMS: dict[str, str] = {
    "alcohol": "bebidas alcohólicas, ron, cerveza, whisky, vino, vodka, licores, cigarrillos",
    "bebes": "productos para bebé, pañales, compotas, fórmula infantil, biberones, aseo del bebé",
    "bebidas": "bebidas sin alcohol, agua, refresco, jugo, malta, té, bebidas hidratantes",
    "carnes-pescados": "carnes y pescados frescos, pollo, res, cerdo, pavo, mariscos, embutidos crudos",
    "comidas-preparadas": "comida lista para llevar, rotisería, sándwiches, sushi, platos servidos",
    "congelados": "productos congelados, helados, hielo, vegetales congelados, pizzas y platos congelados",
    "cuidado-del-hogar": "limpieza y mantenimiento del hogar, detergentes, desinfectantes, papel, desechables",
    "cuidado-personal": "higiene y cuidado personal, jabón, shampoo, desodorante, pasta dental, maquillaje",
    "despensa-abarrotes": "despensa seca, arroz, habichuelas, aceite, pastas, enlatados, café, condimentos",
    "embutidos-delicatessen": "embutidos y fiambres, jamón, salami, salchichas, longaniza, charcutería",
    "escolares-oficina": "útiles escolares y de oficina, cuadernos, lápices, mochilas, papelería",
    "frutas-verduras": "frutas y vegetales frescos, víveres, hierbas, ensaladas, pulpa de fruta",
    "lacteos-huevos": "lácteos y huevos, leche, queso, yogurt, mantequilla, crema",
    "mascotas": "productos para mascotas, alimento para perro y gato, arena sanitaria, accesorios",
    "panaderia-tortilleria": "panadería, pan, bizcochos, tortillas, discos de masa, hojaldre",
    "salud-farmacia": "salud y farmacia, medicinas, vitaminas, primeros auxilios, cuidado prenatal",
    "snacks-dulces": "snacks y dulces, papitas, galletas, chocolates, caramelos, picaderas, postres",
}


def seed_category_terms(session: "Session", market_id: str) -> int:
    """Aplica `CATEGORY_TERMS` a las hojas del market SIN términos, **por key**. Idempotente
    (respeta hojas ya sembradas / editadas en el admin). `set_terms` invalida el embedding →
    la próxima corrida de EmbedCategories las re-embebe. Devuelve cuántas hojas sembró."""
    from src.contexts.save.infrastructure.repositories import SqlCategoryIndexRepository

    index = SqlCategoryIndexRepository(session)
    seeded = 0
    for node_id, key in index.leaf_keys_without_terms(market_id, limit=10_000):
        terms = CATEGORY_TERMS.get(key)
        if terms:
            index.set_terms(node_id, terms, market_id)
            seeded += 1
    return seeded


def seed_root_terms(session: "Session", market_id: str) -> int:
    """Aplica `ROOT_TERMS` a las RAÍCES (level 0) sin términos. Mismo contrato que las hojas:
    por key, idempotente, e invalida el embedding para que se re-embeba."""
    from src.contexts.save.infrastructure.repositories import SqlCategoryIndexRepository

    index = SqlCategoryIndexRepository(session)
    seeded = 0
    for node_id, key in index.root_keys_without_terms(market_id, limit=1_000):
        terms = ROOT_TERMS.get(key)
        if terms:
            index.set_terms(node_id, terms, market_id)
            seeded += 1
    return seeded

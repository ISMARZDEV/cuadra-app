"""Set etiquetado de la búsqueda del usuario (§6.6 / Apéndice C.1). NO es un test.

Es el **gate de calidad** de la búsqueda híbrida: sin él no hay forma de saber si sirve. Se mide
con un script (`top-1` / `top-5`), no con una aserción binaria — el umbral es una medición, no un
booleano.

⚠️ **ADVERTENCIA SOBRE ESTE SET — leer antes de creerle al número.**

El Apéndice C.1 pedía sesgarlo hacia café, carnes, bebé, aceites y marcas blancas, que son las
categorías que activan debate. **No se pudo:** medido el 2026-08-02, el catálogo de dev tiene
**café = 0, carnes = 0, aceites = 1, bebé = 2**, y 93 de sus 133 canónicos (70%) viven en «Arroz,
Granos & Legumbres». Este set está construido contra el catálogo que EXISTE, no contra el que el
plan suponía.

Consecuencias para la lectura del resultado:

1. **El número sale INFLADO** en las consultas de marca+tamaño, porque el catálogo es
   monotemático y las distinciones son de empaque, no de producto.
2. **Y sale CASTIGADO** en las consultas genéricas de arroz, donde 60+ productos casi idénticos
   empatan: cuál de los empatados sale primero es una lotería, no calidad de retrieval. Por eso
   las consultas genéricas de arroz llevan un conjunto ACEPTABLE, no un único id.
3. Cuando la ingesta traiga café, carnes y aceites, **este set hay que rehacerlo** — y el número
   de hoy no será comparable con el de entonces.

`expected` es un conjunto de nombres ACEPTABLES: para una consulta legítimamente ambigua
(«pan integral») hay varias respuestas correctas, y exigir una sola mediría un capricho.
Los nombres se resuelven a ids en tiempo de medición: el nombre es la llave estable, el uuid no.
"""
from __future__ import annotations

from typing import NamedTuple


class LabeledQuery(NamedTuple):
    query: str
    mode: str            # typo | sinonimo | marca_producto | producto_tamano | descripcion
    expected: set[str]   # nombres EXACTOS de canónicos aceptables


# fmt: off
RETRIEVAL_QUERIES: list[LabeledQuery] = [
    # ── Typo ────────────────────────────────────────────────────────────────────────────────
    LabeledQuery("arros campos 20 lb", "typo", {"Arroz Campos Premium 20 Lb"}),
    LabeledQuery("abichuelas rojas la famosa", "typo", {"Habichuelas Rojas La Famosa 15 Oz"}),
    LabeledQuery("guandlues wala", "typo", {"Guandules Wala 800 Gr", "Guandules Verdes Wala 15Oz"}),
    LabeledQuery("lentehas goya", "typo", {"Lentejas Goya 15.5 Oz"}),
    LabeledQuery("kinoa roja", "typo", {"Quinoa Roja en Empaque Doypack Multifoods 12 Onzas"}),
    LabeledQuery("arros integral la garsa", "typo", {"Arroz Integral La Garza 2 Lbs"}),

    # ── Sinónimo regional ───────────────────────────────────────────────────────────────────
    LabeledQuery("frijoles rojos", "sinonimo", {
        "Habichuelas Rojas Giselle 400 Gr.", "Habichuelas Rojas Giselle 800 G",
        "Habichuelas Rojas La Famosa 15 Oz", "Habichuelas Rojas Linda 15 Oz",
        "Habichuelas Rojas Red Kidney Goya 15.5oz", "Habichuelas Rojas   Rica  400G",
        "Habichuelas Rojas Wala Enlatadas 15 Oz",
        "Habichuelas Rojas Largas La Sanjuanera 800 Gr.",
    }),
    LabeledQuery("gandules", "sinonimo", {
        "Guandules Giselle 400 G.", "Guandules Giselle 800 G.", "Guandules Secos Goya  15 Oz",
        "Guandules Verdes Wala 15Oz", "Guandules Wala 800 Gr",
    }),
    LabeledQuery("porotos negros", "sinonimo", {"Habichuelas Negras Wala Enlatadas 15 Oz"}),
    LabeledQuery("alubias blancas", "sinonimo", {"Habichuelas Blancas Wala Enlatadas 15 Oz"}),

    # ── Marca + producto ────────────────────────────────────────────────────────────────────
    LabeledQuery("habichuelas negras wala", "marca_producto",
                 {"Habichuelas Negras Wala Enlatadas 15 Oz"}),
    LabeledQuery("quinoa multifoods tricolor", "marca_producto",
                 {"Quinoa Tricolor en Empaque Doypack Multifoods 12 Onzas"}),
    LabeledQuery("vinagre okayama", "marca_producto", {"Vinagre De Arroz Okayama 500 Ml"}),
    LabeledQuery("galleta baby mum mum banana", "marca_producto",
                 {"Galleta Arroz Banana Baby Mum-Mum 50 Gr"}),
    LabeledQuery("arroz basmati goya", "marca_producto", {"Arroz Basmati Goya 12 Oz"}),
    LabeledQuery("lentejas giselle", "marca_producto", {"Lentejas Giselle 400 Gr."}),
    LabeledQuery("garbanzos wala", "marca_producto", {"Garbanzos Wala 800 Gr"}),
    LabeledQuery("compota nutriben arroz con pollo", "marca_producto", {
        "Compota Arroz Con Pollo Nutriben 120G", "Compota Arroz Con Pollo Nutriben 235G",
    }),

    # ── Producto + tamaño ───────────────────────────────────────────────────────────────────
    LabeledQuery("arroz bisono 50 lb", "producto_tamano",
                 {"Arroz Bisono Selecto Enriquecido 50 Lb", "Arroz Super Selecto Saco Bisono 50 Lb"}),
    LabeledQuery("arroz campos 5 libras", "producto_tamano", {"Arroz Campos Premium 5 Lb"}),
    LabeledQuery("arroz pimco 3 lb", "producto_tamano",
                 {"Arroz Premium Pimco  3 Lb", "Arroz Selecto Pimco 3 Lb"}),
    LabeledQuery("habichuelas giselle 800", "producto_tamano",
                 {"Habichuelas Rojas Giselle 800 G", "Guandules Giselle 800 G."}),
    LabeledQuery("arroz la garza 20 libras", "producto_tamano", {"Arroz La Garza Premium 20 Lbs"}),
    LabeledQuery("trigo wala 800", "producto_tamano", {"Trigo #3 Wala 800 Gr"}),

    # ── Descripción difusa ──────────────────────────────────────────────────────────────────
    LabeledQuery("comida para perro", "descripcion", {
        "Alimento Seco Para Perro Adulto Purina One Cordero Y Arroz 4Lb",
        "Alimento Seco Para Perro Adulto Purina One Pollo Y Arroz 4Lb",
        "Alimento Seco Para Perro Cachorro Purina One® +Plus Pollo Y Arroz 4Lb",
        "Alimento Seco Para Perro Fórmula Sin Granos De Cordero Y Arroz Purina One 16.5 Lb",
        "Alimento Seco Para Perros Fórmula De Cordero Y Arroz Purina One  8 Lb",
    }),
    LabeledQuery("pan integral", "descripcion", {
        "PAN INTEGRAL 456 GR", "PAN INTEGRAL MULTICEREAL 400GR", "PAN INTEGRAL SIN AZUCAR 630 GR",
    }),
    LabeledQuery("bebida de arroz", "descripcion", {"NATRUE BEBIDA ARROZ 32 OZ"}),
    LabeledQuery("mascarilla para la cara", "descripcion",
                 {"Mascarilla Facial Celavi De Arroz Mko19"}),
    LabeledQuery("harina de arroz", "descripcion", {
        "Harina De Arroz Goya 24Oz", "Harina Arroz Integral Bob Red Mill 680 G",
    }),
    LabeledQuery("galletas sin gluten", "descripcion", {
        "Tortitas De Arroz Con Sal Himalaya Sin Gluten Sante 110", "Cereal Arroz Herosin Gluten 220G",
    }),
]
# fmt: on

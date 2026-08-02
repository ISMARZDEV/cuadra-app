"""Unit — matcher léxico determinista (save-category-classification, Batch 3). PURO, sin DB.

Diccionario keyword→hoja derivado de los nombres de subcategoría. Alta precisión: un token
ambiguo (mapea a >1 hoja) se descarta; un nombre sin keyword conocido → None.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.lexicon import (
    build_lexicon_index,
    lexicon_match,
    lexicon_match_path,
)

_LEAVES = [
    ("n-arroz", "Arroz, Granos & Legumbres"),
    ("n-cerveza", "Cerveza"),
    ("n-pollo", "Pollo"),
]


def test_matches_distinctive_keyword() -> None:
    idx = build_lexicon_index(_LEAVES)
    hit = lexicon_match("Arroz Blanco Sirena 5 Lb", idx)
    assert hit is not None
    node_id, confidence = hit
    assert node_id == "n-arroz"
    assert confidence >= 0.9


def test_matches_single_word_subcategory() -> None:
    idx = build_lexicon_index(_LEAVES)
    assert lexicon_match("Cerveza Presidente 12 oz", idx)[0] == "n-cerveza"


def test_no_keyword_returns_none() -> None:
    idx = build_lexicon_index(_LEAVES)
    assert lexicon_match("Producto XYZ genérico", idx) is None


def test_accent_and_case_insensitive() -> None:
    idx = build_lexicon_index([("n-cafe", "Café")])
    # "Cafe" (sin acento, distinta caja) debe pegar con "Café" (slugify normaliza acento+caja)
    assert lexicon_match("Cafe Molido La Aurora", idx)[0] == "n-cafe"


def test_ambiguous_token_is_dropped() -> None:
    # "Especiales" aparece en dos subcategorías distintas → token ambiguo, no debe asignar
    idx = build_lexicon_index([
        ("n-a", "Aves & Carnes Especiales"),
        ("n-b", "Ofertas Especiales"),
    ])
    assert lexicon_match("Combo Especiales del día", idx) is None


def test_stopwords_and_short_tokens_ignored() -> None:
    # "de"/"&" no deben indexar; un producto con solo esos tokens comunes → None
    idx = build_lexicon_index([("n-x", "Aceite & Vinagre")])
    assert lexicon_match("de la casa", idx) is None


# ------------------- tokens de ATRIBUTO no pueden decidir una hoja (medido 2026-08-01) --
#
# `build_lexicon_index` declaraba identificador a TODO token que apareciera en una sola hoja. Eso
# confunde ser ÚNICO en la taxonomía con ser IDENTIFICADOR: en «Semillas & Frutos Secos», `secos`
# es un adjetivo que modifica a `frutos` y solo no nombra ninguna clase de producto.
#
# Medido sobre los 292 store_products de la corrida real:
#   · «secos»    decidió 6 productos — 6 MAL (todos guandules secos tratados como nueces)
#   · «semillas» decidió 1 producto  — 1 MAL (`Uvas Rojas SIN Semillas`: la AUSENCIA del atributo)
#   · «alimentos» resolvió el path de origen `Mascotas > Perro > Alimentos para Perros`
#     a la hoja `Alimentos Para Bebé`
#
# Costo real: `Guandules Secos La Famosa 15 Oz` es un producto legítimo de la canasta que quedaba
# sin clasificar, y sin clasificación NO puede canonizarse ni descartarlo R2 — el hueco del 31%.
#
# El criterio para agregar un token acá: nombra un ATRIBUTO (estado, ausencia, destinatario) en vez
# de una CLASE de producto. `pan`, `galletas` y `arroz` NO entran: nombran la clase.


def test_an_attribute_token_does_not_decide_the_leaf_it_lives_in() -> None:
    # `secos` vive en «Semillas & Frutos Secos» y en ninguna otra hoja, pero un guandul SECO no es
    # un fruto seco. Sin otra señal el léxico debe ABSTENERSE (None) y dejar decidir al vector/juez.
    idx = build_lexicon_index([
        ("n-frutos", "Semillas & Frutos Secos"),
        ("n-arroz", "Arroz, Granos & Legumbres"),
    ])
    assert lexicon_match("GOYA GANDULES SECOS 14 OZ", idx) is None


def test_the_absence_of_an_attribute_does_not_decide_the_leaf() -> None:
    # `Uvas Rojas SIN Semillas` — el producto se define por NO tener semillas. Que la palabra
    # aparezca no lo convierte en fruto seco.
    idx = build_lexicon_index([("n-frutos", "Semillas & Frutos Secos")])
    assert lexicon_match("Uvas Rojas Sin Semillas Paq. 2 Libra", idx) is None


def test_a_generic_recipient_token_does_not_decide_the_leaf() -> None:
    # `alimentos` es demasiado genérico: TODO comestible es un alimento. Decidía
    # «Alimentos Para Bebé» para la comida de perro, vía el path de origen.
    idx = build_lexicon_index([("n-bebe", "Alimentos Para Bebé")])
    assert lexicon_match("Alimentos para Perros Cordero", idx) is None


def test_the_leaf_stays_reachable_through_its_class_token() -> None:
    # El arreglo NO debe dejar la hoja huérfana: `frutos` sigue nombrando la clase y sigue decidiendo.
    # Sin esta guarda, filtrar de más volvería «Semillas & Frutos Secos» inalcanzable por léxico.
    idx = build_lexicon_index([
        ("n-frutos", "Semillas & Frutos Secos"),
        ("n-arroz", "Arroz, Granos & Legumbres"),
    ])
    assert lexicon_match("Frutos Mixtos Planters 200 Gr", idx)[0] == "n-frutos"


# ------------------------------- singular y plural son el MISMO token (medido 2026-08-01) --
#
# La hoja se llama «Alimento Para Perro» (singular) y la tienda categoriza en «Alimentos para
# perros» (plural), así que el path de origen NO pegaba y el producto se quedaba sin señal de
# fuente. Con `alimentos` fuera del índice eso dejó de ser inocuo: para
# `Alimento Seco Para Perros Fórmula De Cordero Y Arroz Purina One 8 Lb`
# (origen `Supermercado > Mascotas > Perros > Alimentos para perros`) sobrevivía sólo el token
# `arroz` del NOMBRE, y comida de perro terminaba clasificada como «Arroz, Granos & Legumbres».
#
# Antes del arreglo de atributos ese caso abstenía por CONFLICTO — pero por accidente, porque el
# bug `alimentos → Alimentos Para Bebé` fabricaba una segunda señal falsa. Quitar el bug destapó
# que el número gramatical nunca se había normalizado.
#
# La normalización se aplica en `_tokens`, o sea a AMBOS lados (índice y consulta). Por eso un
# stem imperfecto es inofensivo: mientras las dos puntas se normalicen igual, siguen encontrándose.


def test_a_plural_in_the_product_matches_a_singular_leaf() -> None:
    idx = build_lexicon_index([("n-perro", "Alimento Para Perro")])
    assert lexicon_match("Alimento Seco Para Perros Purina One 8 Lb", idx)[0] == "n-perro"


def test_a_singular_in_the_product_matches_a_plural_leaf() -> None:
    # La simetría inversa: la hoja en plural y el producto en singular.
    idx = build_lexicon_index([("n-galletas", "Galletas & Barras")])
    assert lexicon_match("Galleta de Guayaba Nero's 120 Gr", idx)[0] == "n-galletas"


def test_the_dog_food_source_path_resolves_instead_of_falling_to_the_name() -> None:
    """El caso real completo: con el path de origen resolviendo, la comida de perro deja de
    clasificarse por el `arroz` de su nombre.

    Es la razón por la que este arreglo no es cosmético: sin él, `bootstrap_canonicals` podría
    canonizar comida de perro dentro del catálogo de arroz, y R2 no la descartaría porque la vería
    en scope.
    """
    idx = build_lexicon_index([
        ("n-perro", "Alimento Para Perro"),
        ("n-arroz", "Arroz, Granos & Legumbres"),
    ])
    hit = lexicon_match_path("Supermercado > Mascotas > Perros > Alimentos para perros", idx)
    assert hit is not None and hit[0] == "n-perro"


def test_plural_folding_does_not_collapse_unrelated_words() -> None:
    # Guarda contra un stem demasiado agresivo: `arroz` y `arepa` no deben confundirse, y un token
    # corto no puede quedar por debajo del mínimo y desaparecer del índice.
    idx = build_lexicon_index([
        ("n-arroz", "Arroz, Granos & Legumbres"),
        ("n-pan", "Pan"),
    ])
    assert lexicon_match("Arroz La Garza 5 Lb", idx)[0] == "n-arroz"
    assert lexicon_match("Pan Hawaiano 340 g", idx)[0] == "n-pan"


def test_class_naming_tokens_are_untouched() -> None:
    # No-regresión de los tokens que SÍ funcionan (medidos: `arroz` 128 productos, `pan`,
    # `galletas`). Sin esto, un filtro demasiado ancho pasaría los tests de arriba y rompería todo.
    idx = build_lexicon_index([
        ("n-arroz", "Arroz, Granos & Legumbres"),
        ("n-pan", "Pan"),
        ("n-galletas", "Galletas & Barras"),
    ])
    assert lexicon_match("Arroz La Garza Premium 5 Lb", idx)[0] == "n-arroz"
    assert lexicon_match("Pan Hawaiano S. Rosen's 340 g", idx)[0] == "n-pan"
    assert lexicon_match("Galletas de Guayaba Vegan Nero's", idx)[0] == "n-galletas"


# ------------------------ la medición DEGRADA tokens, nunca los promueve (Etapa 4) --
#
# El índice infería "único en la taxonomía ⇒ identifica la clase". Medido sobre 2562 productos con
# la estantería de cada tienda como etiqueta débil, esa inferencia falla seguido:
#
#   token        el índice dice…            el corpus dice…        lift
#   polvo        Bebidas En Polvo           Cuidado Del Hogar      5.41   (detergente en polvo)
#   pasta        Pastas                     Lácteos & Huevos       6.83   (pasta dental)
#   liquido      Té Líquido                 Cuidado Del Hogar      8.33   (detergente líquido)
#   barra        Galletas & Barras          Cuidado Personal       3.25   (barra de jabón)
#   avena        Bebidas De Almendra…       Despensa & Abarrotes   0.93   (lift <1: desinforma)
#
# La sonda encontró 19 así sola. `polvo` ya figuraba como error conocido en docs/ desde julio.
#
# REGLA DE SEGURIDAD: la medición sólo puede QUITAR. Un token se degrada con evidencia en contra;
# sin evidencia queda como está. Así el índice sigue funcionando igual si la medición nunca corrió,
# y una medición sobre pocos datos no puede vaciar el léxico.


def test_a_demoted_token_stops_deciding() -> None:
    idx = build_lexicon_index(
        [("n-bebidas", "Bebidas En Polvo"), ("n-arroz", "Arroz, Granos & Legumbres")],
        demoted=frozenset({"polvo"}),
    )
    # `Detergente Ace Polvo` ya no se clasifica como bebida; sin otra señal el léxico se abstiene.
    assert lexicon_match("Detergente Ace Polvo 5000 Gr", idx) is None


def test_demoting_one_token_does_not_touch_the_others() -> None:
    idx = build_lexicon_index(
        [("n-bebidas", "Bebidas En Polvo"), ("n-arroz", "Arroz, Granos & Legumbres")],
        demoted=frozenset({"polvo"}),
    )
    assert lexicon_match("Arroz La Garza 5 Lb", idx)[0] == "n-arroz"


def test_without_measurement_the_index_behaves_exactly_as_before() -> None:
    # La garantía que hace seguro el cambio: sin datos medidos, cero diferencia.
    leaves = [("n-bebidas", "Bebidas En Polvo"), ("n-arroz", "Arroz, Granos & Legumbres")]
    assert build_lexicon_index(leaves) == build_lexicon_index(leaves, demoted=frozenset())


def test_demotion_is_normalized_like_any_other_token() -> None:
    # La lista medida viene de tokens ya normalizados, pero degradar «polvos» debe alcanzar a
    # «polvo»: si la normalización no se aplicara a los dos lados, la degradación no pegaría nunca.
    idx = build_lexicon_index(
        [("n-bebidas", "Bebidas En Polvo")], demoted=frozenset({"polvos"})
    )
    assert lexicon_match("Detergente Ace Polvo", idx) is None


def test_form_modifiers_do_not_decide_a_leaf() -> None:
    """Segunda tanda de tokens de ATRIBUTO: los que nombran la FORMA o el ESTADO del producto.

    Medido 2026-08-01 sobre 2562 productos, degradar los seis da **+137 productos que empiezan a
    resolver contra −63 que dejan** — y las bajas eran errores: `SIMILAC POLVO 800 GR` (fórmula
    infantil) y `LEVAPAN AZUCAR POLVO` se clasificaban como «Bebidas En Polvo».

    Ganan 137 porque quitar el token ambiguo deja que el OTRO token del nombre decida solo:
    `Detergente Líquido Ariel` pegaba «Té Líquido» y «Detergentes», se abstenía por ambigüedad, y
    ahora resuelve por `detergente`.
    """
    idx = build_lexicon_index([
        ("n-te", "Té Líquido"),
        ("n-detergente", "Detergentes & Suavizantes"),
        ("n-bebidas-polvo", "Bebidas En Polvo"),
    ])

    # `liquido` ya no arrastra a «Té Líquido», así que `detergente` decide limpio.
    assert lexicon_match("Detergente Líquido Ariel 3 Lt", idx)[0] == "n-detergente"
    # Y un producto que sólo traía el modificador deja de clasificarse mal.
    assert lexicon_match("SIMILAC 5HMO 1 POLVO 800 GR", idx) is None


def test_the_intimate_soap_case_stops_conflicting() -> None:
    # El caso real reportado desde la consola: `Jabon Liquido Intimo Borasol` no se clasificaba
    # porque el ORIGEN decía «Higiene Íntima» (correcto) y el NOMBRE decía «Té Líquido» por el
    # token `liquido` → dos señales fuertes en conflicto → abstención.
    idx = build_lexicon_index([("n-te", "Té Líquido"), ("n-intima", "Higiene Íntima")])

    assert lexicon_match("Jabon Liquido Intimo Borasol 16 Onz", idx) is None, (
        "el nombre ya no propone «Té Líquido», así que deja de haber conflicto y gana el origen"
    )


def test_crema_does_not_decide_a_category_on_its_own() -> None:
    """El falso positivo medido 2026-08-01 desde la consola.

    `Chocolate Con Crema De Cacao Y Avellanas Torras 200` con origen
    «Despensa > Mermeladas y Untables > Crema de Avellana» terminaba en **«Crema Agria» con 0.97 de
    confianza y auto_link**. El mecanismo es doblemente perverso:

      · el token `crema` aparece en UNA sola hoja («Crema Agria»), así que la regla de ambigüedad no
        lo descarta — pero nombra una FORMA (algo cremoso), no la clase del producto;
      · `lexicon_match_path` va hondo→general y **retorna al primer hit**: el segmento más hondo
        («Crema de Avellana») pega `crema` y nunca llega al segmento 2 («Mermeladas y Untables»),
        que sí tiene el token correcto.

    Y como AMBAS señales (origen y nombre) consultan el MISMO índice, las dos pegan por el mismo
    token, «coinciden», y la coincidencia se premia como refuerzo independiente. Un untable de
    avellanas queda como crema agria con más confianza que la que tendría cualquiera de las señales
    por separado.
    """
    idx = build_lexicon_index([
        ("n-crema-agria", "Crema Agria"),
        ("n-untables", "Untables & Mermeladas"),
    ])

    # 1. `crema` sola no alcanza para decidir.
    assert lexicon_match("Chocolate Con Crema De Cacao Y Avellanas Torras 200", idx) is None, (
        "«crema» nombra una forma, no la clase: no puede elegir «Crema Agria» por sí sola"
    )

    # 2. Con `crema` degradado, el path de origen llega al segmento que SÍ identifica.
    hit = lexicon_match_path("Despensa > Mermeladas y Untables > Crema de Avellana", idx)
    assert hit is not None and hit[0] == "n-untables", (
        "el segmento hondo ya no secuestra el match; gana «Mermeladas y Untables»"
    )

    # 3. Pero la hoja «Crema Agria» sigue siendo alcanzable por su token de clase.
    assert lexicon_match("Crema Agria Rica 8 Onz", idx)[0] == "n-crema-agria"


def test_pasta_does_not_decide_a_category_on_its_own() -> None:
    """Mismo defecto que `crema`, medido 2026-08-01 sobre el corpus real de 2562 productos.

    67 productos llevan el token `pasta` y **42 (63%) son de higiene oral**, no comida. Con `crema`
    ya degradado, esos dentífricos dejaban de caer en «Crema Agria» sólo para caer en «Pastas» —
    cambiar una etiqueta equivocada por otra, no un arreglo.

    El conteo crudo de la simulación dice −6 y es engañoso: de las 9 «pérdidas», 7 eran falsos
    positivos que se corrigen (`VICTORINA PASTA TOMATE` ×4 — pasta de TOMATE—, `Pasta de Dientes
    Colgate` ×2, y una pizza). El balance real es **33 falsos positivos corregidos contra 2
    pérdidas genuinas** (`Pasta Fusilli/Spaghetti Jovial`, que conservan su señal de origen).

    «Pastas» sigue alcanzable por los tokens de sus otros nombres de hoja y por el path de origen.
    """
    idx = build_lexicon_index([
        ("n-pastas", "Pastas"),
        ("n-oral", "Cuidado Oral"),
    ])

    assert lexicon_match("Pasta Dental Colgate Triple Acción 100 ML", idx) is None, (
        "«pasta» nombra una forma; 63% de los productos que la llevan son higiene oral"
    )
    assert lexicon_match("VICTORINA PASTA TOMATE 900 GR", idx) is None, (
        "pasta de TOMATE tampoco es la hoja «Pastas»"
    )
    # El origen sigue resolviendo el dentífrico por su propio segmento.
    hit = lexicon_match_path("Salud y Belleza > Cuidado Oral > Cremas Dentales", idx)
    assert hit is not None and hit[0] == "n-oral"


def test_infantil_does_not_decide_a_category_on_its_own() -> None:
    """El peor de los tres, medido 2026-08-01: **67 productos llevan `infantil` y CERO son
    detergente** (100% de error).

    Reportado por la traza de la consola: `Fórmula Infantil Similac 2 5HMO 800 Gramos` salía
    «Detergente Infantil De Bebé» con 0.95 y auto_link — comida de bebé clasificada como producto
    de limpieza. El token nombra al DESTINATARIO (para niños), no la clase: lo llevan fórmulas,
    cereales (`NESTUM Cereal Infantil`) y cepillos (`BRAVO CEPILLO INFANTIL`).

    CONSECUENCIA ASUMIDA: «Detergente Infantil De Bebé» queda sin tokens, o sea inalcanzable POR
    LÉXICO. No queda huérfana en la cascada — sigue alcanzable por vector y por el juez, que desde
    este cambio recorre todos los candidatos de la banda gris y no sólo el top-1. Ya había 5 hojas
    en esa situación por degradaciones anteriores; es el costo conocido de la regla, y es preferible
    a que un token 100% equivocado auto-enlace con 0.95.
    """
    idx = build_lexicon_index([
        ("n-det-bebe", "Detergente Infantil De Bebé"),
        ("n-formula", "Fórmulas Infantiles"),
    ])

    # Lo que importa: `infantil` ya no arrastra al DETERGENTE. La fórmula resuelve por su token de
    # clase (`formula`), que es la respuesta correcta — no una abstención.
    assert lexicon_match("Fórmula Infantil Similac 2 5HMO 800 Gramos", idx)[0] == "n-formula"
    # Y un producto que SÓLO traía el modificador deja de clasificarse mal.
    assert lexicon_match("BRAVO CEPILLO INFANTIL 1 CT", idx) is None, (
        "«infantil» nombra al destinatario, no la clase: 67/67 de los que lo llevan NO son detergente"
    )


def test_attribute_tokens_are_stemmed_like_every_other_token() -> None:
    """`_ATTRIBUTE_TOKENS` debe plegarse igual que el índice, o sus entradas plurales son LETRA
    MUERTA.

    Descubierto 2026-08-01 al degradar `infantil`. `build_lexicon_index` hacía
    `_ATTRIBUTE_TOKENS | {_singular(t) for t in demoted}`: a `demoted` le aplicaba el stem y a la
    lista en código NO. Como el índice guarda tokens YA plegados, toda entrada cuyo stem difiera de
    sí misma nunca podía matchear.

    Golpea justo a los plurales de palabra terminada en CONSONANTE, donde el plegado no es
    identidad: `infantiles`→`infantile` e `integrales`→`integrale`. Ambas estaban en la lista y
    ninguna de las dos hacía nada. Es el mismo argumento que el docstring ya daba para `demoted`
    («si no se aplicara el mismo plegado a las dos puntas, degradar "polvos" no alcanzaría a
    "polvo"») — sólo que no se estaba aplicando a la lista en código.
    """
    # Una hoja nombrada en PLURAL con palabra terminada en consonante.
    idx = build_lexicon_index([
        ("n-det", "Detergentes Infantiles"),
        ("n-arroz", "Arroz, Granos & Legumbres"),
    ])

    assert "infantile" not in idx, (
        "`infantiles` está en _ATTRIBUTE_TOKENS: su forma plegada tampoco puede quedar en el índice"
    )
    assert lexicon_match("Cepillo Infantiles Bravo", idx) is None
    # El resto de la hoja sigue intacto: sólo se excluye el atributo.
    assert lexicon_match("Arroz Blanco Sirena 5 Lb", idx)[0] == "n-arroz"

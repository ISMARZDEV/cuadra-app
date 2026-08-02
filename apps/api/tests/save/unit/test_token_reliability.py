"""Unit — medición del poder discriminativo de los tokens del léxico. PURO, sin DB.

Reemplaza la inferencia equivocada del índice (*único en la taxonomía ⇒ identifica la clase*) por
la medida (*discriminativo en el corpus ⇒ identifica la clase*).

La métrica es el LIFT, no P(raíz|token), y esa distinción no es un detalle: con un corpus sesgado,
P tiende al prior de la clase mayoritaria. Medido el 2026-08-01 con el corpus al 84% de una sola
raíz, `«lbs»` —una unidad de medida— daba P=1.00 y aparecía como "identificador". El lift lo
descarta porque no levanta la probabilidad por encima de la tasa base.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.token_reliability import (
    LabeledProduct,
    measure_token_reliability,
)

# hoja → raíz (lo que el índice cree)
_ROOT_OF = {"n-bebidas-polvo": "r-bebidas", "n-arroz": "r-despensa", "n-limpieza": "r-hogar"}
_INDEX = {"polvo": "n-bebidas-polvo", "arroz": "n-arroz"}


def _corpus(*pares: tuple[str, str]) -> list[LabeledProduct]:
    return [LabeledProduct(name=n, root_id=r) for n, r in pares]


def test_an_anti_informative_token_is_demoted() -> None:
    """La ÚNICA señal que degrada sola: lift < 1.

    Significa que el token hace MENOS probable su clase que el azar del corpus. No hay lectura
    benigna de eso. Es el caso medido de `avena` (lift 0.93): aparece en hojuelas, en bebida
    vegetal y en jabón.

    Criterios más ambiciosos se probaron contra el corpus real y el gate de simulación los frenó:
    "raíz distinta" perdía 298 clasificaciones (degradaba `detergente`, que está bien) y "no
    concentra" perdía 455 (degradaba `leche`, `pollo`, `queso` — polisemia normal del idioma).
    """
    corpus = _corpus(
        ("Polvo Limpiador Ajax", "r-hogar"),
        ("Leche En Polvo Nido 400 Gr", "r-despensa"),
        ("Chocolate En Polvo Nesquik", "r-despensa"),
        ("Arroz La Garza 5 Lb", "r-despensa"),
        ("Arroz Selecto", "r-despensa"),
        ("Habichuelas Goya", "r-despensa"),
        ("Lentejas Wala", "r-despensa"),
        ("Detergente Ace", "r-hogar"),
    )
    stats = {s.token: s for s in measure_token_reliability(corpus, _INDEX, _ROOT_OF, min_support=3)}

    assert stats["polvo"].lift < 1.0
    assert stats["polvo"].decides is False


def test_a_polysemous_but_useful_token_survives() -> None:
    # `leche` se reparte (de vaca, de coco, corporal) y aun así sirve. Un criterio de concentración
    # lo habría degradado junto con `pollo` y `queso`, rompiendo 455 clasificaciones.
    corpus = _corpus(
        ("Leche Rica Entera", "r-lacteos"),
        ("Leche Evaporada Carnation", "r-lacteos"),
        ("Leche Corporal Nivea", "r-hogar"),  # el uso polisémico
        ("Arroz La Garza", "r-despensa"),
        ("Arroz Selecto", "r-despensa"),
        ("Habichuelas Goya", "r-despensa"),
        ("Lentejas Wala", "r-despensa"),
    )
    index = {**_INDEX, "leche": "n-leche"}
    root_of = {**_ROOT_OF, "n-leche": "r-lacteos"}
    stats = {s.token: s for s in measure_token_reliability(corpus, index, root_of, min_support=3)}

    assert stats["leche"].probability < 0.8, "no concentra…"
    assert stats["leche"].decides is True, "…pero sigue siendo informativo"


def test_a_token_that_concentrates_elsewhere_is_NOT_demoted_but_flagged() -> None:
    """El caso que obligó a cambiar el criterio: `detergente`.

    De 140 productos con `detergente`, TODOS caen en Limpieza — concentra perfecto, así que ES un
    identificador. Lo que está mal es que el índice lo mande a «Detergente De Bebé», la única hoja
    cuyo nombre lo contiene. Degradarlo habría borrado 140 clasificaciones correctas para arreglar
    un problema que no era del token sino de la TAXONOMÍA.

    Un primer criterio ("la raíz del corpus difiere de la del índice") lo mezclaba con `polvo`,
    porque los dos producen desacuerdo de raíz. La concentración los separa.
    """
    index = {**_INDEX, "detergente": "n-bebidas-polvo"}  # hoja de otra raíz, como en producción
    corpus = _corpus(
        ("Detergente Ace 5000 Gr", "r-hogar"),
        ("Detergente Ariel Liquido", "r-hogar"),
        ("Detergente Rindex", "r-hogar"),
        ("Arroz La Garza", "r-despensa"),
    )
    stats = {s.token: s for s in measure_token_reliability(corpus, index, _ROOT_OF, min_support=3)}

    assert stats["detergente"].decides is True, "concentra: sigue siendo identificador"
    assert stats["detergente"].mismapped is True, "pero apunta a la raíz equivocada → revisar"


def test_a_token_whose_products_confirm_its_leaf_keeps_deciding() -> None:
    # El corpus va BALANCEADO a propósito (3 despensa / 3 hogar). Con un corpus 75% despensa el
    # techo de lift sería 1/0.75 = 1.33 y ni siquiera un token perfecto llegaría al piso — el mismo
    # efecto que midiéndolo en grande dejó a `arroz` y `habichuela` empatados en 1.19.
    corpus = _corpus(
        ("Arroz La Garza 5 Lb", "r-despensa"),
        ("Arroz Selecto Bisono 10 Lb", "r-despensa"),
        ("Arroz Goya Integral 2 Lb", "r-despensa"),
        ("Detergente Ace Polvo", "r-hogar"),
        ("Jabon Ariel", "r-hogar"),
        ("Cloro Mistolin", "r-hogar"),
    )
    stats = {s.token: s for s in measure_token_reliability(corpus, _INDEX, _ROOT_OF, min_support=3)}

    assert stats["arroz"].decides is True


def test_without_enough_support_the_token_is_left_alone() -> None:
    """La regla de seguridad: la medición sólo puede QUITAR, y sólo con evidencia.

    Sin esto, un corpus chico degradaría medio léxico por ruido — y como el índice alimenta la
    etapa que más decide en producción, eso sería peor que el problema que vino a resolver.
    """
    corpus = _corpus(("Detergente Ace Polvo", "r-hogar"))  # n=1, por debajo del mínimo
    stats = {s.token: s for s in measure_token_reliability(corpus, _INDEX, _ROOT_OF, min_support=3)}

    assert stats["polvo"].decides is True, "sin evidencia suficiente NO se degrada"
    assert stats["polvo"].support == 1


def test_lift_not_raw_probability_decides() -> None:
    """La trampa que invalidó la primera medición.

    `unidad` aparece en 4 productos y TODOS caen en la raíz mayoritaria → P=1.00. Pero esa raíz ya
    es el 80% del corpus, así que el token no aporta nada: su lift es 1.25, no 1.00/0.25.
    Con P crudo habría pasado por identificador perfecto; con lift queda expuesto.
    """
    corpus = _corpus(
        ("Arroz La Garza 5 Lb Unidad", "r-despensa"),
        ("Arroz Selecto 10 Lb Unidad", "r-despensa"),
        ("Habichuelas Goya Unidad", "r-despensa"),
        ("Lentejas Wala Unidad", "r-despensa"),
        ("Detergente Ace", "r-hogar"),
    )
    index = {**_INDEX, "unidad": "n-arroz"}
    stats = {s.token: s for s in measure_token_reliability(corpus, index, _ROOT_OF, min_support=3)}

    assert stats["unidad"].probability == 1.0
    assert stats["unidad"].lift < 1.3, "concentra, pero apenas sobre la tasa base"


def test_a_token_spread_across_roots_is_demoted() -> None:
    # `avena` medido: lift 0.93 y concentración 0.36 — aparece en hojuelas, en bebida vegetal y en
    # jabón. Se reparte, así que no identifica.
    corpus = _corpus(
        ("Avena Quaker Hojuelas", "r-despensa"),
        ("Bebida De Avena Silk", "r-bebidas"),
        ("Jabon Avena Dove", "r-hogar"),
        ("Arroz La Garza", "r-despensa"),
        ("Arroz Selecto", "r-despensa"),
        ("Arroz Goya", "r-despensa"),
    )
    index = {**_INDEX, "avena": "n-arroz"}
    stats = {s.token: s for s in measure_token_reliability(corpus, index, _ROOT_OF, min_support=3)}

    assert stats["avena"].decides is False


def test_only_tokens_in_the_index_are_measured() -> None:
    # Medir tokens que no deciden nada sería ruido: la pregunta es si los que HOY deciden merecen
    # hacerlo. Promover tokens nuevos es una decisión distinta y no la toma esta función.
    corpus = _corpus(
        ("Arroz La Garza 5 Lb", "r-despensa"),
        ("Arroz Selecto", "r-despensa"),
        ("Arroz Goya", "r-despensa"),
    )
    tokens = {s.token for s in measure_token_reliability(corpus, _INDEX, _ROOT_OF, min_support=3)}

    assert tokens <= set(_INDEX)
    assert "garza" not in tokens

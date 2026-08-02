"""Unit — «X de Y» nombra la clase X hecha CON Y: el complemento no decide la categoría.

`arroz` es a la vez el nombre de una CLASE y uno de los ingredientes más comunes del supermercado.
Como token identifica bien (150 aciertos medidos), degradarlo como a `crema`/`pasta`/`infantil`
cambiaría un error por otro. Lo que falla no es el token: es leerlo cuando viene de COMPLEMENTO.

Medido 2026-08-02 con el A/B completo sobre el corpus (315 nombres únicos):
  · **13 GANADOS** — abstención → decisión correcta (`Harina De Arroz`→«Harinas», `Vinagre De
    Arroz`→«Aceite & Vinagre», `Mascarilla Facial ... De Arroz`→«Cuidado Facial»). Antes el
    complemento competía con el token de clase, y esa ambigüedad FALSA hacía abstenerse.
  · **12 PERDIDOS — los DOCE eran falsos positivos** (`Fideo De Arroz`, `Pasta Spaghetti De Arroz`,
    `MORCILLA DE ARROZ`, `Tortitas De Arroz`). Pasan de un auto-link equivocado a 0.95 a una
    abstención que resuelve la banda gris.
  · **0 cambios de hoja** — ningún producto salta de una categoría a otra.

DOS límites, los dos medidos, sin los cuales la regla rompe más de lo que arregla:
  1. Es de CONSULTA, no de índice: 12 hojas se llaman «X De Y» (`Sustituto De Carne`, `Pulpa De
     Frutas`, `Control De Plagas`) y perderían su token distintivo.
  2. NO aplica a la señal de ORIGEN: en un path «de» marca el ÁMBITO, no el material. De 94
     `source_category` reales la regla cambia una, y para peor.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.lexicon import (
    build_lexicon_index,
    lexicon_match,
    lexicon_match_path,
    lexicon_suggestions,
    matched_tokens,
)

# Espejo del árbol real, con los nombres que participan de los casos medidos.
ARROZ, HARINAS, GALLETAS = "n-arroz", "n-harinas", "n-galletas"
VINAGRE, FACIAL, CARNE = "n-vinagre", "n-facial", "n-carne"
BANO, LIMPIEZA = "n-bano", "n-limpieza"
LEAVES = [
    (ARROZ, "Arroz, Granos & Legumbres"),
    (HARINAS, "Harinas"),
    (GALLETAS, "Galletas & Barras"),
    (VINAGRE, "Aceite & Vinagre"),
    (FACIAL, "Cuidado Facial"),
    (CARNE, "Sustituto De Carne"),
    (BANO, "Accesorios De Baño"),
    (LIMPIEZA, "Productos De Limpieza"),
]
INDEX = build_lexicon_index(LEAVES)


class TestElComplementoNoDecideLaClase:
    def test_un_fideo_de_arroz_no_es_arroz(self) -> None:
        # Antes: «Arroz, Granos & Legumbres» con 0.95, o sea auto-link a la categoría equivocada.
        assert lexicon_match("Fideo De Arroz Okayama 454 G", INDEX) is None

    def test_la_harina_de_arroz_es_harina(self) -> None:
        # Antes se abstenía: `harina` y `arroz` pegaban en hojas distintas → ambigüedad FALSA.
        assert lexicon_match("Harina De Arroz Goya 24Oz", INDEX) == (HARINAS, 0.95)

    def test_el_vinagre_de_arroz_es_vinagre(self) -> None:
        assert lexicon_match("Vinagre De Arroz Okayama 500 Ml", INDEX) == (VINAGRE, 0.95)

    def test_una_mascarilla_de_arroz_es_cuidado_facial(self) -> None:
        assert lexicon_match("Mascarilla Facial Celavi De Arroz Mko19", INDEX) == (FACIAL, 0.95)

    def test_las_galletas_de_arroz_son_galletas(self) -> None:
        assert lexicon_match("Galletas De Arroz Crich Bio 70 Gr", INDEX) == (GALLETAS, 0.95)


class TestElArrozDeVerdadSigueResolviendo:
    """La regla no puede costarle nada al caso que el token acierta 150 veces."""

    def test_el_arroz_como_clase_no_se_toca(self) -> None:
        assert lexicon_match("Arroz Campos Premium 20 Lb", INDEX) == (ARROZ, 0.95)

    def test_tampoco_cuando_la_marca_va_primero(self) -> None:
        assert lexicon_match("BRAVO ARROZ PREMIUM 10 LB", INDEX) == (ARROZ, 0.95)


class TestLaReglaEsDeConsultaNoDeIndice:
    def test_una_hoja_llamada_X_de_Y_conserva_su_token(self) -> None:
        # Doce hojas reales se llaman así. Aplicar la regla al construir el índice las volvería
        # inalcanzables — `carne` es JUSTO lo que identifica a «Sustituto De Carne».
        assert INDEX["carne"] == CARNE
        assert lexicon_match("Sustituto De Carne Beyond 226 Gr", INDEX) == (CARNE, 0.95)


class TestElOrigenNoUsaLaRegla:
    def test_en_un_path_el_de_marca_el_ambito_no_el_material(self) -> None:
        # Medido: es el ÚNICO de 94 source_category que la regla cambiaría, y lo empeora —
        # `accesorio` decidiría solo y mandaría utensilios de limpieza a «Accesorios De Baño».
        # Un solo segmento a propósito: aísla la regla del recorrido del path.
        assert lexicon_match_path("Accesorios y Utensilios de Limpieza", INDEX) is None

    def test_un_path_inequivoco_sigue_resolviendo(self) -> None:
        assert lexicon_match_path("Despensa > Harinas", INDEX) == (HARINAS, 0.95)


class TestLaEvidenciaDiceLaVerdad:
    def test_no_se_reporta_como_causa_un_token_que_no_decidio(self) -> None:
        # `matched_tokens` alimenta la traza de la consola: si dijera `arroz`, culparía al token de
        # una decisión que la regla ya le quitó.
        assert matched_tokens("Harina De Arroz Goya 24Oz", INDEX) == ("harina",)

    def test_al_humano_se_le_siguen_mostrando_todas_las_opciones(self) -> None:
        # `lexicon_suggestions` no DECIDE, EXPONE. Esconderle el arroz a la persona que revisa
        # sería quitarle evidencia; acá el complemento sí es una pista legítima.
        nodes = {s.taxonomy_node_id for s in lexicon_suggestions("Fideo De Arroz Okayama", INDEX)}
        assert ARROZ in nodes

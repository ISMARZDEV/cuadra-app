"""Unit — reconocer una marca CONOCIDA dentro del nombre del producto (PURO, ADR 31).

Ni Magento (Nacional/Jumbo) ni Bravo exponen marca — verificado en vivo 2026-07-30: el `brand_text`
de Magento viene vacío en todo el catálogo y el `marcaArticulo` de Bravo son códigos internos por
tipo de producto. Pero el NOMBRE sí la lleva, y en posiciones distintas según la cadena:
Bravo la pone primero ("LA GARZA ARROZ 10 LB"), Nacional en el medio ("Arroz Enriquecido La Garza
5 Lb"). Por eso no sirve "el primer token".

La regla es RECONOCER, no adivinar: sólo se acepta una marca que YA existe en nuestro catálogo
(poblado por Sirena/VTEX, que sí la publica). Inventar una marca a partir de un nombre sería
fabricar catálogo, justo lo que la regla sagrada del módulo prohíbe.
"""
from __future__ import annotations

from src.contexts.save.domain.brand_from_name import build_brand_index, match_brand

_KNOWN = ["LA GARZA", "GOYA", "La Famosa", "BRAVO", "LIDER", "LA SANJUANERA", "Hansaplast"]


def _index(names: list[str] | None = None):  # type: ignore[no-untyped-def]
    return build_brand_index(names if names is not None else _KNOWN)


class TestReconoceLaMarcaEstéDondeEsté:
    def test_al_principio_del_nombre_como_la_pone_bravo(self) -> None:
        assert match_brand("LA GARZA ARROZ 10 LB", _index()) == "LA GARZA"

    def test_en_el_medio_del_nombre_como_la_pone_nacional(self) -> None:
        assert match_brand("Arroz Enriquecido La Garza 5 Lb", _index()) == "LA GARZA"

    def test_ignora_acentos_y_mayusculas(self) -> None:
        assert match_brand("Habichuelas Pintas Líder 15 Onz", _index()) == "LIDER"

    def test_sin_marca_conocida_devuelve_None_en_vez_de_inventar(self) -> None:
        assert match_brand("ARROZ SELECTO 10 LB", _index()) is None


class TestNoSeDejaEnganarPorCoincidenciasParciales:
    def test_exige_palabra_completa_no_subcadena(self) -> None:
        # "GOYA" dentro de "GOYANA" no es Goya
        assert match_brand("Salsa GOYANA Picante 300 Gr", _index()) is None

    def test_gana_la_marca_mas_LARGA_cuando_una_contiene_a_la_otra(self) -> None:
        index = build_brand_index(["FAMOSA", "LA FAMOSA"])
        assert match_brand("Habichuela Pinta La Famosa 15 Onz", index) == "LA FAMOSA"

    def test_descarta_marcas_demasiado_cortas_que_matchearian_cualquier_cosa(self) -> None:
        # una "marca" de 1-2 letras aparece en cualquier nombre por casualidad
        index = build_brand_index(["L1", "GOYA"])
        assert match_brand("Arroz L1 Premium", index) is None

    def test_un_nombre_vacio_no_revienta(self) -> None:
        assert match_brand("", _index()) is None
        assert match_brand("   ", _index()) is None


class TestEsDeterministaAnteElCatalogoSucio:
    def test_duplicados_por_casing_o_acento_resuelven_SIEMPRE_al_mismo_valor(self) -> None:
        """`save.brand` tiene 'BRAVO'/'Bravo' y 'LIDER'/'LÍDER'/'Líder' (duplicados reales). El
        matcher no puede devolver uno u otro según el orden en que vinieron de la base."""
        a = match_brand("BRAVO ARROZ PREMIUM 5 LB", build_brand_index(["BRAVO", "Bravo"]))
        b = match_brand("BRAVO ARROZ PREMIUM 5 LB", build_brand_index(["Bravo", "BRAVO"]))
        assert a == b

    def test_no_se_cae_con_una_lista_vacia_de_marcas(self) -> None:
        assert match_brand("LA GARZA ARROZ 10 LB", build_brand_index([])) is None

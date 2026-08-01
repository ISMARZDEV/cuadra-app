"""Unit — `brand_key`: la IDENTIDAD de una marca, para que no entre dos veces con distinta grafía.

`normalize_brand` ya fijaba el casing canónico (MAYÚSCULA), pero no toca los acentos, así que
`LIDER` y `LÍDER` seguían siendo dos marcas distintas. Medido sobre la base real: 29 marcas con 4
grupos duplicados y 5 filas de más (`Bravo`/`BRAVO`, `La Famosa`/`LA FAMOSA`,
`LIDER`/`Líder`/`LÍDER`, `One`/`ONE`).

La distinción importa: `brand_key` es la LLAVE (se compara, nunca se muestra) y `normalize_brand`
es la forma de DISPLAY (se guarda y se enseña). Plegar acentos para mostrar convertiría "LÍDER" en
"LIDER", que es escribir mal el nombre de una marca real.
"""
from __future__ import annotations

from src.contexts.save.domain.canonical_import import brand_key, normalize_brand


class TestLaLlaveIgnoraLasDiferenciasDeGrafia:
    def test_el_casing_no_hace_marcas_distintas(self) -> None:
        assert brand_key("Bravo") == brand_key("BRAVO") == brand_key("bravo")

    def test_los_acentos_tampoco(self) -> None:
        assert brand_key("Líder") == brand_key("LÍDER") == brand_key("LIDER")

    def test_ni_los_espacios_de_sobra(self) -> None:
        assert brand_key("  La Famosa  ") == brand_key("LA FAMOSA")

    def test_marcas_de_verdad_distintas_siguen_siendo_distintas(self) -> None:
        assert brand_key("GOYA") != brand_key("GOYITA")

    def test_vacio_y_None_no_revientan(self) -> None:
        assert brand_key(None) == ""
        assert brand_key("   ") == ""


class TestLaLlaveNoSustituyeAlNombreQueSeMuestra:
    def test_display_conserva_el_acento_y_la_llave_no(self) -> None:
        """Guardar "LIDER" como nombre sería escribir mal una marca real; la llave sí lo pliega."""
        assert normalize_brand("Líder") == "LÍDER"
        assert brand_key("Líder") == "LIDER"

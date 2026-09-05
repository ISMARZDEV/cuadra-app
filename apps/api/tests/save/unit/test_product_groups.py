"""Dominio PURO de los grupos de productos: cómo se limpia un nombre y cuántos caben.

Un grupo es una carpeta que el usuario nombra. Todo lo que aquí se prueba existe porque el nombre
lo escribe una persona con el pulgar, en un teclado de móvil, y lo que teclea no es lo que quiere
guardar: sobra espacio, sobra mayúscula y sobra longitud.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.groups import (
    GROUP_NAME_MAX,
    MAX_GROUPS_PER_USER,
    group_key,
    normalize_group_name,
)


class TestNormalizeGroupName:
    def test_recorta_los_bordes(self) -> None:
        assert normalize_group_name("  Fiesta  ") == "Fiesta"

    def test_colapsa_los_espacios_de_dentro(self) -> None:
        # «Canasta   del  mes» y «Canasta del mes» son el MISMO grupo para quien lo escribió: la
        # diferencia es el pulgar, no la intención.
        assert normalize_group_name("Canasta   del  mes") == "Canasta del mes"

    def test_conserva_las_mayúsculas_tal_cual_las_escribió(self) -> None:
        # Se normaliza para COMPARAR, no para reescribirle el nombre al usuario. Guardar «fiesta»
        # cuando escribió «Fiesta» es corregirle sin permiso.
        assert normalize_group_name("Fiesta de Navidad") == "Fiesta de Navidad"

    def test_un_nombre_vacío_no_es_un_nombre(self) -> None:
        for vacío in ("", "   ", "\n\t "):
            with pytest.raises(ValueError):
                normalize_group_name(vacío)

    def test_recorta_al_máximo_en_vez_de_rechazar(self) -> None:
        # Rechazar un nombre largo obliga al usuario a contar caracteres; recortarlo le deja el
        # grupo creado. Lo que NO se puede es guardar 4 KB porque alguien pegó un texto.
        largo = "a" * (GROUP_NAME_MAX + 50)
        assert normalize_group_name(largo) == "a" * GROUP_NAME_MAX


class TestGroupKey:
    def test_dos_nombres_que_sólo_difieren_en_caja_son_EL_MISMO_grupo(self) -> None:
        # Un usuario con «Fiesta» y «fiesta» en la lista no tiene dos grupos: tiene un error de
        # tecleo que ya no puede deshacer sin borrar uno.
        assert group_key("Fiesta") == group_key("fiesta")
        assert group_key("  FIESTA ") == group_key("Fiesta")

    def test_los_acentos_SÍ_distinguen(self) -> None:
        # A diferencia de las marcas —donde «Nestle» y «Nestlé» son la misma empresa—, aquí el
        # nombre no apunta a nada del mundo: es una etiqueta personal. Quitarle los acentos sería
        # decidir por el usuario que dos palabras suyas son la misma.
        assert group_key("Fiesta") != group_key("Fiestá")

    def test_dos_grupos_distintos_siguen_siendo_distintos(self) -> None:
        assert group_key("Fiesta") != group_key("Canasta del mes")


class TestLímite:
    def test_hay_un_techo_de_grupos_por_usuario(self) -> None:
        # No es burocracia: la hoja de «añadir a grupo» es una LISTA que hay que recorrer con el
        # pulgar. Sin techo, el propio usuario se construye una pantalla inusable.
        assert MAX_GROUPS_PER_USER >= 10
        assert MAX_GROUPS_PER_USER <= 100

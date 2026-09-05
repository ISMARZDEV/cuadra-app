"""Grupos de productos — dominio PURO (ADR 31).

Un grupo es una CARPETA que el usuario nombra: «Canasta del mes», «Fiesta», «Cosas del bebé». No
describe nada del mundo —a diferencia de una marca o una categoría, que apuntan a algo real— así
que aquí no hay verdad que descubrir: hay una etiqueta personal que respetar.

De ahí sale la única decisión interesante de este módulo: **se normaliza para COMPARAR, nunca para
reescribir**. El nombre se guarda tal y como se tecleó; lo que se normaliza es la LLAVE con la que
se detecta que dos nombres son el mismo grupo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime


#: El largo máximo del nombre. No es una regla de negocio, es el ancho de una fila en la hoja: un
#: nombre más largo se corta con puntos suspensivos y deja de decir cuál grupo es.
GROUP_NAME_MAX = 40

#: El techo de grupos por usuario. La hoja de «añadir a grupo» es una lista que se recorre con el
#: pulgar; sin techo, el propio usuario se construye una pantalla inusable.
MAX_GROUPS_PER_USER = 50

_ESPACIOS = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class ProductGroup:
    """Un grupo como lo ve su dueño. `product_count` es lo que la hoja necesita para no mentir."""

    id: str
    name: str
    product_count: int
    created_at: datetime


def normalize_group_name(raw: str) -> str:
    """Limpia lo que sobra del teclado: bordes, espacios repetidos y largo.

    ⭐ RECORTA en vez de rechazar cuando se pasa de largo. Rechazar obliga al usuario a contar
    caracteres; recortar le deja el grupo creado. Lo que no se puede es guardar 4 KB porque alguien
    pegó un texto en el campo.

    Levanta `ValueError` sólo cuando no queda NADA — un nombre en blanco no es un nombre, y la hoja
    mostraría una fila vacía que no se puede distinguir de otra.
    """
    limpio = _ESPACIOS.sub(" ", raw).strip()
    if not limpio:
        raise ValueError("El nombre del grupo no puede estar vacío")
    return limpio[:GROUP_NAME_MAX]


def group_key(name: str) -> str:
    """La llave con la que dos nombres son el MISMO grupo: sin bordes, sin dobles espacios, en baja.

    ⚠️ **Los acentos SÍ distinguen**, al revés que en las marcas (`brand_from_name`). Allí «Nestle»
    y «Nestlé» son la misma empresa y plegar el acento CORRIGE un dato del mundo; aquí el nombre no
    apunta a nada externo, así que plegarlo sería decidir por el usuario que dos palabras suyas son
    la misma.
    """
    return _ESPACIOS.sub(" ", name).strip().lower()

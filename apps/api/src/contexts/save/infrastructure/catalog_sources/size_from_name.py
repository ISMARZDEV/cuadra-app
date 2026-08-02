"""Extracción best-effort del tamaño desde el nombre del producto ("Arroz ... 5lb" → "5lb").

Compartido por los adapters (VTEX, Magento): las tiendas no exponen el tamaño como campo,
viaja embebido en el nombre. El string crudo se normaliza después con `parse_size`.

Tres reglas, en orden de evidencia. La ESTRICTA (número pegado a la unidad) manda siempre; las dos
de recuperación solo corren si aquella no encontró nada, así que no pueden cambiar lo que ya
funcionaba. Medido sobre el corpus real: cero discrepancias en los 297 nombres que ya resolvía.
"""
from __future__ import annotations

import re

_COUNT_UNIT = r"(?:und|un|uds|unidad(?:es)?|pq|paq|paquetes?)"
_UNIT = (
    r"(?:lbs?|libras?|kg|kgs|kilos?|gr?|grs|gramos?|oz|onz(?:as?)?|lt?s?|litros?|ml|gl|gal"
    rf"|gal[oó]n|{_COUNT_UNIT})"
)
# El prefijo `n/` OPCIONAL captura la fracción ENTERA. Sin él, "ALBAHACA VERDE 1/2 LB" enganchaba
# con el "2 LB" del denominador y el producto se guardaba pesando 2 libras en vez de media.
_NUMBER = r"(?:\d+\s*/\s*)?\d+(?:[.,]\d+)?"

_SIZE_IN_NAME = re.compile(rf"{_NUMBER}\s*{_UNIT}\b", re.IGNORECASE)
# La MARCA se cuela entre el número y la unidad: "Arroz Jasmine 5 Goya Lbs". El tamaño está entero,
# solo no es adyacente. Máximo 2 palabras de hueco: más allá ya no hay evidencia de que el número y
# la unidad sean el mismo tamaño.
_SIZE_WITH_GAP = re.compile(
    rf"({_NUMBER})\s+(?:(?!{_UNIT}\b)[^\s\d]+\s+){{1,2}}({_UNIT})\b", re.IGNORECASE
)
# Marcador de conteo SIN número al final del nombre ("FRESAS SELECTAS UN"): se vende por unidad.
# Solo al FINAL, porque "un" en español es también artículo ("UN BUEN CAFÉ").
_BARE_COUNT_TAIL = re.compile(rf"\b({_COUNT_UNIT})\.?\s*$", re.IGNORECASE)


def extract_size(name: str) -> str:
    """Extrae el último token de tamaño del nombre. Devuelve "" si no hay."""
    matches = list(_SIZE_IN_NAME.finditer(name))
    if matches:
        return matches[-1].group(0).strip()

    with_gap = list(_SIZE_WITH_GAP.finditer(name))
    if with_gap:
        # Se descarta lo del medio: lo que el tamaño es son el número y su unidad.
        last = with_gap[-1]
        return f"{last.group(1)} {last.group(2)}"

    bare = _BARE_COUNT_TAIL.search(name)
    return bare.group(1) if bare else ""

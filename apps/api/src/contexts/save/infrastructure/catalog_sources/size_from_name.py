"""Extracción best-effort del tamaño desde el nombre del producto ("Arroz ... 5lb" → "5lb").

Compartido por los adapters (VTEX, Magento): las tiendas no exponen el tamaño como campo,
viaja embebido en el nombre. El string crudo se normaliza después con `parse_size`.
"""
from __future__ import annotations

import re

_SIZE_IN_NAME = re.compile(
    r"\d+(?:[.,]\d+)?\s*"
    r"(?:lbs?|libras?|kg|kgs|kilos?|gr?|grs|gramos?|oz|onz(?:as?)?|lt?s?|litros?|ml|gl|gal|gal[oó]n"
    r"|und|un|uds|unidad(?:es)?)\b",
    re.IGNORECASE,
)


def extract_size(name: str) -> str:
    """Extrae el último token de tamaño del nombre. Devuelve "" si no hay."""
    matches = list(_SIZE_IN_NAME.finditer(name))
    return matches[-1].group(0).strip() if matches else ""

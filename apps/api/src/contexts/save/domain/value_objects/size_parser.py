"""Parser de tamaños de Save (§6.2), PURO (ADR 31): string del catálogo → `Quantity` base.

Tolera mayúsculas, decimales con coma, abreviaturas dominicanas y multipacks (NxM). El
factor de cada unidad la convierte a la unidad base de su medida (kg / L / und). Onza (OZ) =
masa por defecto (ver nota en el test). Todo en `Decimal` — sin float.
"""
from __future__ import annotations

import re
from decimal import Decimal

from .units import Quantity, UnitMeasure

# token de unidad → (medida, factor a unidad base como string Decimal)
_UNITS: dict[str, tuple[UnitMeasure, str]] = {
    # masa → kg
    "lb": (UnitMeasure.MASS, "0.45359237"),
    "libra": (UnitMeasure.MASS, "0.45359237"),
    "libras": (UnitMeasure.MASS, "0.45359237"),
    "kg": (UnitMeasure.MASS, "1"),
    "kgs": (UnitMeasure.MASS, "1"),
    "kilo": (UnitMeasure.MASS, "1"),
    "kilos": (UnitMeasure.MASS, "1"),
    "g": (UnitMeasure.MASS, "0.001"),
    "gr": (UnitMeasure.MASS, "0.001"),
    "grs": (UnitMeasure.MASS, "0.001"),
    "gramo": (UnitMeasure.MASS, "0.001"),
    "gramos": (UnitMeasure.MASS, "0.001"),
    "oz": (UnitMeasure.MASS, "0.028349523125"),
    "onza": (UnitMeasure.MASS, "0.028349523125"),
    "onzas": (UnitMeasure.MASS, "0.028349523125"),
    # volumen → L
    "l": (UnitMeasure.VOLUME, "1"),
    "lt": (UnitMeasure.VOLUME, "1"),
    "lts": (UnitMeasure.VOLUME, "1"),
    "litro": (UnitMeasure.VOLUME, "1"),
    "litros": (UnitMeasure.VOLUME, "1"),
    "ml": (UnitMeasure.VOLUME, "0.001"),
    "gl": (UnitMeasure.VOLUME, "3.78541"),
    "gal": (UnitMeasure.VOLUME, "3.78541"),
    "galon": (UnitMeasure.VOLUME, "3.78541"),
    "galón": (UnitMeasure.VOLUME, "3.78541"),
    # conteo → unidad
    "und": (UnitMeasure.COUNT, "1"),
    "un": (UnitMeasure.COUNT, "1"),
    "u": (UnitMeasure.COUNT, "1"),
    "uds": (UnitMeasure.COUNT, "1"),
    "unidad": (UnitMeasure.COUNT, "1"),
    "unidades": (UnitMeasure.COUNT, "1"),
    "pza": (UnitMeasure.COUNT, "1"),
    "pzas": (UnitMeasure.COUNT, "1"),
    "pack": (UnitMeasure.COUNT, "1"),
}

_MULTIPACK = re.compile(r"^\s*(\d+)\s*[x×]\s*(.+)$", re.IGNORECASE)
_SIZE = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zá]+)\.?\s*$")


def parse_size(text: str) -> Quantity:
    """`"5lb"` → `Quantity(2.26796185, MASS)`. Multipack `NxM` multiplica la unidad interna.

    Levanta `ValueError` si no se puede parsear o la unidad es desconocida.
    """
    multi = _MULTIPACK.match(text)
    if multi:
        n = int(multi.group(1))
        inner = parse_size(multi.group(2))
        return Quantity(inner.amount * n, inner.measure)

    m = _SIZE.match(text)
    if not m:
        raise ValueError(f"No se pudo parsear el tamaño: {text!r}")

    number = Decimal(m.group(1).replace(",", "."))
    token = m.group(2).lower().rstrip(".")
    if token not in _UNITS:
        raise ValueError(f"Unidad desconocida: {token!r} en {text!r}")

    measure, factor = _UNITS[token]
    return Quantity(number * Decimal(factor), measure)

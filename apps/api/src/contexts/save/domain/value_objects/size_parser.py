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
    "lbs": (UnitMeasure.MASS, "0.45359237"),
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
    "onz": (UnitMeasure.MASS, "0.028349523125"),
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


# --- Normalización de DISPLAY (Etapa: unidades canónicas) -----------------------------------------
# Canonicaliza la ORTOGRAFÍA de la unidad a un token de 2 letras SIN convertir de unidad ("20 Lbs" →
# "20 Lb", nunca a kg). Alimenta lo que se GUARDA (store_product.size_text en ingesta, canonical
# .display_size al crear) para que todo venga consistente desde la fuente.
_DISPLAY_UNIT: dict[str, str] = {
    "lb": "Lb", "lbs": "Lb", "libra": "Lb", "libras": "Lb",
    "kg": "Kg", "kgs": "Kg", "kilo": "Kg", "kilos": "Kg",
    "g": "Gr", "gr": "Gr", "grs": "Gr", "gramo": "Gr", "gramos": "Gr",
    "oz": "Oz", "onz": "Oz", "onza": "Oz", "onzas": "Oz",
    "l": "Lt", "lt": "Lt", "lts": "Lt", "litro": "Lt", "litros": "Lt",
    "ml": "Ml",
    "gl": "Gl", "gal": "Gl", "galon": "Gl", "galón": "Gl",
    "und": "Un", "un": "Un", "u": "Un", "uds": "Un", "unidad": "Un", "unidades": "Un",
    "pza": "Un", "pzas": "Un", "pack": "Un",
}
# Tallas por descriptor (sin número) → 1 letra.
_DISPLAY_DESCRIPTOR: dict[str, str] = {
    "grande": "G", "mediana": "M", "mediano": "M",
    "pequeña": "P", "pequena": "P", "pequeño": "P", "pequeno": "P", "chico": "P", "chica": "P",
}


def _clean_amount(raw: str) -> str:
    """`"2.0"`→`"2"`, `"1,5"`→`"1.5"`, `"20"`→`"20"`."""
    a = raw.replace(",", ".")
    return a.rstrip("0").rstrip(".") if "." in a else a


def normalize_size_text(text: str | None) -> str | None:
    """Tamaño crudo → forma canónica de display: `"20 Lbs"`→`"20 Lb"`, `"Grande"`→`"G"`. Ante lo
    no parseable o unidad desconocida devuelve el texto TAL CUAL (nunca inventa). `None`/`""` pasan."""
    if not text or not text.strip():
        return text
    stripped = text.strip()
    descriptor = _DISPLAY_DESCRIPTOR.get(stripped.lower())
    if descriptor:
        return descriptor
    m = _SIZE.match(stripped)
    if not m:
        return text
    unit = _DISPLAY_UNIT.get(m.group(2).lower().rstrip("."))
    if unit is None:
        return text
    return f"{_clean_amount(m.group(1))} {unit}"

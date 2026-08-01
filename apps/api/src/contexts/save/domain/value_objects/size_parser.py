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
# El fresco dominicano se vende por FRACCIÓN ("ALBAHACA VERDE 1/2 LB"). Sin esta rama, `_SIZE`
# enganchaba con el denominador —"1/2 LB" se guardaba como 2 Lb, "1/4 LB" como 4 Lb— o sea 4× y 16×
# de error, y en la dirección peor: media libra pasaba a dos.
_FRACTION = re.compile(r"^\s*(\d+)\s*/\s*(\d+)\s*([a-zA-Zá]+)\.?\s*$")


def _amount_and_token(text: str) -> tuple[Decimal, str]:
    """`(cantidad, token de unidad)` de un tamaño simple o fraccionario.

    La UNIDAD es obligatoria en las dos formas: es la única guarda que impide que un "24/7" del
    nombre de un producto se convierta en un tamaño inventado.
    """
    fraction = _FRACTION.match(text)
    if fraction:
        denominator = Decimal(fraction.group(2))
        if denominator == 0:
            raise ValueError(f"Fracción con denominador cero: {text!r}")
        return Decimal(fraction.group(1)) / denominator, fraction.group(3)

    simple = _SIZE.match(text)
    if not simple:
        raise ValueError(f"No se pudo parsear el tamaño: {text!r}")
    return Decimal(simple.group(1).replace(",", ".")), simple.group(2)


def parse_size(text: str) -> Quantity:
    """`"5lb"` → `Quantity(2.26796185, MASS)`; `"1/2 lb"` → la MITAD, no el denominador.
    Multipack `NxM` multiplica la unidad interna.

    Levanta `ValueError` si no se puede parsear o la unidad es desconocida.
    """
    multi = _MULTIPACK.match(text)
    if multi:
        n = int(multi.group(1))
        inner = parse_size(multi.group(2))
        return Quantity(inner.amount * n, inner.measure)

    number, raw_token = _amount_and_token(text)
    token = raw_token.lower().rstrip(".")
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
    try:
        number, raw_token = _amount_and_token(stripped)
    except ValueError:
        return text
    unit = _DISPLAY_UNIT.get(raw_token.lower().rstrip("."))
    if unit is None:
        return text
    # La fracción se muestra en DECIMAL ("1/2 Lb" → "0.5 Lb"): el resto de la columna ya es decimal
    # (`_clean_amount` convierte "1,5" → "1.5"), y mezclar las dos notaciones haría los tamaños
    # incomparables de un vistazo, que es justo para lo que existe esta columna.
    return f"{_clean_amount(str(number))} {unit}"

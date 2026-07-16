"""Barcodes — qué código identifica un producto ENTRE tiendas, y en qué forma. PURO (ADR 31).

El barcode es el único identificador de un producto que NO depende de la base de datos de la tienda:
por eso la etapa EAN de la cascada auto-enlaza con score 1.0, sin juez ni revisión humana. Justamente
por eso, lo que entra acá tiene que ser irreprochable — un false merge en esa etapa corrompe toda
comparación construida encima y NADIE lo revisa, porque fue automático (regla SAGRADA del matching).

Dos responsabilidades, y las dos son necesarias:

1. **NORMALIZAR** — un UPC-A (12 díg.) y su forma EAN-13 (con el 0 adelante) son EL MISMO código.
   Si Bravo escribe `760593023182` y Sirena `0760593023182` y no convergen a la misma cadena, la
   etapa EAN nunca los enlaza: el producto se duplica y el bug es INVISIBLE (se manifiesta como "no
   matchea", un falso negativo silencioso). Todo sale en forma EAN-13 canónica.

2. **FILTRAR** — de forma ESTRICTA y asimétrica: ante la duda NO hay barcode, y la cascada sigue por
   nombre/vector → juez → cola, que sí tiene red de contención humana. Descartar un código bueno
   cuesta un match más caro; aceptar uno malo mete un dato corrupto y silencioso.
"""
from __future__ import annotations

from collections.abc import Iterable

_EAN13 = 13
_UPCA = 12

# GS1 reserva estos prefijos a "restricted distribution": códigos que la tienda se asigna a sí misma.
# En supermercados son, sobre todo, artículos de PESO VARIABLE (fiambre, frutas, panadería) donde el
# barcode codifica el PESO o el PRECIO de ESE paquete — no el producto. Dos paquetes del mismo queso
# tienen códigos distintos, y ninguno existe en otra cadena.
#
# Sobre la forma EAN-13 ya normalizada:
#   200-299 → restricted (EAN-13 nativo)
#   020-029 → UPC-A con número de sistema 2 (peso variable) + el 0 de la conversión
#   040-049 → UPC-A con número de sistema 4 (uso local / fidelidad)
# Los dos últimos son la trampa: un filtro que solo mire "2x" los deja pasar disfrazados de `0…`.
_RESTRICTED_RANGES = ((200, 299), (20, 29), (40, 49))


def _checksum_ok(code13: str) -> bool:
    """Dígito verificador GS1 mod-10: se suman los 12 primeros alternando peso 1 y 3, y el
    verificador es lo que falta para llegar a la decena."""
    digits = [int(c) for c in code13]
    total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits[:12]))
    return (10 - total % 10) % 10 == digits[12]


def normalize_barcode(code: str) -> str | None:
    """Lleva el código a EAN-13 canónico, o `None` si no es un barcode bien formado.

    Acepta EAN-13 (13 díg.) y UPC-A (12 díg. → se le antepone un 0, regla GS1). Cualquier otro largo
    es un PLU o un id interno, no un barcode. El checksum se valida SIEMPRE sobre la forma de 13.
    """
    if not code.isdigit():
        return None
    if len(code) == _UPCA:
        code = "0" + code  # UPC-A ≡ EAN-13 con 0 adelante
    if len(code) != _EAN13 or not _checksum_ok(code):
        return None
    return code


def is_valid_ean13(code: str) -> bool:
    """¿Es un barcode bien formado (EAN-13 o UPC-A)? No dice nada sobre si sirve cross-tienda."""
    return normalize_barcode(code) is not None


def is_global_ean(code: str) -> bool:
    """¿Este barcode identifica al producto en CUALQUIER tienda? Exige las dos cosas: bien formado Y
    fuera de los rangos internos. Un `2050001175465` cumple lo primero pero no lo segundo."""
    norm = normalize_barcode(code)
    if norm is None:
        return False
    return not any(lo <= int(norm[:3]) <= hi for lo, hi in _RESTRICTED_RANGES)


def pick_global_ean(codes: Iterable[object]) -> str | None:
    """El primer barcode GLOBAL de una lista mezclada, NORMALIZADO a EAN-13. `None` si no hay ninguno.

    Existe porque hay APIs que devuelven TODOS los códigos de un artículo juntos: Bravo (`/get` →
    `associatedEan`) mezcla globales, internos, UPC-A y PLU cortos, y el global NO viene primero.
    Tomar `[0]` metería un código interno en la etapa que auto-enlaza.

    Devolver `None` es un resultado esperado y sano: sin barcode confiable la cascada sigue por
    nombre/vector, que es más caro pero tiene revisión humana.
    """
    for raw in codes:
        if raw is None:
            continue
        norm = normalize_barcode(str(raw).strip())
        if norm is not None and is_global_ean(norm):
            return norm
    return None

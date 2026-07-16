"""EAN — qué barcode identifica un producto ENTRE tiendas. PURO (ADR 31).

El EAN es el único identificador de un producto que NO depende de la base de datos de la tienda: por
eso la etapa EAN de la cascada auto-enlaza con score 1.0, sin juez ni revisión humana. Justamente por
eso, lo que entra acá tiene que ser irreprochable — un false merge en esa etapa corrompe toda
comparación construida encima y NADIE lo revisa, porque fue automático (regla SAGRADA del matching).

De ahí que el filtro sea deliberadamente ESTRICTO y asimétrico: ante la duda NO hay EAN, y la cascada
sigue por nombre/vector → juez → cola, que sí tiene red de contención humana. El costo de descartar un
EAN bueno es un match más caro; el de aceptar uno malo es un dato corrupto y silencioso.
"""
from __future__ import annotations

from collections.abc import Iterable

# GS1 reserva los prefijos 20-29 a "restricted distribution": códigos que la tienda se asigna a sí
# misma. En supermercados son, sobre todo, artículos de PESO VARIABLE (fiambre, frutas, panadería)
# donde el barcode codifica el PESO o el PRECIO de ESE paquete — no el producto. Dos paquetes del
# mismo queso tienen códigos distintos, y el mismo código no existe en ninguna otra cadena.
# Inútil para comparar precios entre tiendas, y peligroso si se lo trata como identidad.
_INTERNAL_PREFIXES = frozenset(f"2{d}" for d in range(10))

_EAN13_LENGTH = 13


def is_valid_ean13(code: str) -> bool:
    """¿Es un EAN-13 bien formado? Valida el dígito verificador (GS1 mod-10): se suman los 12
    primeros dígitos alternando peso 1 y 3, y el verificador es lo que falta para la decena."""
    if len(code) != _EAN13_LENGTH or not code.isdigit():
        return False
    digits = [int(c) for c in code]
    total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits[:12]))
    return (10 - total % 10) % 10 == digits[12]


def is_global_ean(code: str) -> bool:
    """¿Este barcode identifica al producto en CUALQUIER tienda? Exige las dos cosas: EAN-13 válido
    Y fuera del rango interno 2x. Un `2050001175465` cumple lo primero pero no lo segundo."""
    return is_valid_ean13(code) and code[:2] not in _INTERNAL_PREFIXES


def pick_global_ean(codes: Iterable[object]) -> str | None:
    """El primer barcode GLOBAL de una lista mezclada, o `None` si no hay ninguno.

    Existe porque hay APIs que devuelven TODOS los códigos de un artículo juntos: Bravo (`/get` →
    `associatedEan`) mezcla globales, internos 2x y PLU cortos, y el global NO viene primero. Tomar
    `[0]` metería un código interno en la etapa que auto-enlaza.

    Devolver `None` es un resultado esperado y sano (~70% de Bravo, medido sobre 100 artículos): sin
    barcode confiable la cascada sigue por nombre/vector, que es más caro pero tiene revisión humana.
    """
    for raw in codes:
        if raw is None:
            continue
        code = str(raw).strip()
        if is_global_ean(code):
            return code
    return None

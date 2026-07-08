"""Size gate de la cascada de matching (PURO) — Batch 10.

El matcher era CIEGO AL TAMAÑO: el tamaño solo pesaba como un boost blando de +0.05 que comparaba
strings crudos ('5 Lb' vs '10 LB') y casi nunca disparaba, así que colapsaba todas las libras de
un mismo arroz en UN canónico (falso merge — un 5 Lb y un 50 Lb son SKUs distintos con precios
distintos). Esta compuerta lo vuelve una señal DURA: reusa `parse_size` (el parser de tamaños del
dominio) para normalizar el `size_text` de la tienda y lo compara contra el `Quantity` ya
normalizado del canónico.

Contrato conservador (Sacred rule #4 — nunca empeorar hacia un falso merge, pero tampoco romper
matches buenos): devuelve `True` SOLO cuando ambos tamaños son comparables (misma medida) y
difieren más allá de la tolerancia relativa. En cualquier duda —store sin tamaño, no parseable,
medidas distintas, o canónico sin cantidad— devuelve `False`: no bloquea, deja el comportamiento
actual intacto.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.domain.value_objects import Quantity
from src.contexts.save.domain.value_objects.size_parser import parse_size

# Tolerancia relativa: los tamaños reales son discretos y bien separados (1/3/5/10/20/50 Lb), así
# que 2% solo absorbe redondeo de la conversión a unidad base, sin confundir tamaños vecinos.
_DEFAULT_TOLERANCE = Decimal("0.02")


def sizes_conflict(
    store_size_text: str | None,
    canonical_quantity: Quantity | None,
    *,
    tolerance: Decimal = _DEFAULT_TOLERANCE,
) -> bool:
    """`True` = tamaños comparables y en conflicto (distinto SKU → NO auto-linkear). Ver módulo."""
    if not store_size_text or canonical_quantity is None:
        return False
    try:
        store_qty = parse_size(store_size_text)
    except ValueError:
        return False
    if store_qty.measure != canonical_quantity.measure:
        return False
    reference = canonical_quantity.amount
    if reference <= 0:
        return False
    relative_diff = abs(store_qty.amount - reference) / reference
    return relative_diff > tolerance

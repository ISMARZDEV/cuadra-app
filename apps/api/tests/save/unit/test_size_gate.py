"""Unit — size gate de la cascada de matching (PURO). Batch 10.

El matcher era CIEGO AL TAMAÑO: colapsaba 1/5/20/50 Lb del mismo arroz en UN canónico (falso merge —
un 5 Lb y un 50 Lb son SKUs distintos con precios distintos). `sizes_conflict` es la compuerta dura:
`True` SOLO cuando ambos tamaños son comparables (misma medida) y difieren más allá de la tolerancia
→ señal fuerte de SKUs distintos, NO auto-linkear. En la duda (sin tamaño / no parseable / medidas
distintas) devuelve `False`: no bloquea, no empeora el comportamiento actual.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.cascade.size_gate import sizes_conflict


def _mass(kg: str) -> Quantity:
    return Quantity(Decimal(kg), UnitMeasure.MASS)


def test_conflict_when_same_measure_and_amounts_differ() -> None:
    # store 5 Lb (2.268 kg) vs canónico 10 LB (4.536 kg) -> distinto SKU
    assert sizes_conflict("5 Lb", _mass("4.53592370")) is True


def test_no_conflict_when_amounts_agree_within_tolerance() -> None:
    # store "10 Lbs" (4.5359 kg) vs canónico 10 LB (4.53592370 kg) -> concuerdan
    assert sizes_conflict("10 Lbs", _mass("4.53592370")) is False


def test_conflict_for_big_size_gap() -> None:
    # 50 Lb (22.68 kg) vs canónico 10 LB (4.536 kg)
    assert sizes_conflict("50 Lb", _mass("4.53592370")) is True


def test_no_conflict_when_store_size_missing() -> None:
    assert sizes_conflict(None, _mass("4.53592370")) is False
    assert sizes_conflict("", _mass("4.53592370")) is False


def test_no_conflict_when_store_size_unparseable() -> None:
    # no se puede comparar -> no bloquea (no regresa el comportamiento)
    assert sizes_conflict("tamaño familiar", _mass("4.53592370")) is False


def test_no_conflict_when_measures_differ() -> None:
    # store en unidades (COUNT) vs canónico en masa -> incomparable, no bloquea
    assert sizes_conflict("12 Und", _mass("4.53592370")) is False


def test_no_conflict_when_canonical_quantity_missing() -> None:
    assert sizes_conflict("5 Lb", None) is False

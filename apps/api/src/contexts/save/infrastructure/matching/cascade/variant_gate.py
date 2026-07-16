"""Variant gate de la cascada de matching (PURO).

El EAN gate (`_ean_conflicts`) cierra el falso-merge SOLO donde hay barcode. En Magento (Jumbo/
Nacional, que NO exponen EAN) un cruce de VARIANTE auto-linkeaba: dos SKUs de la misma marca+tamaño
que solo difieren en el CONTENIDO (Habichuela Pinta vs Habichuela Negra) — el boost marca+tamaño los
empuja sobre HIGH y el size_gate no dispara (los tamaños coinciden). Medido 2026-07-16: 3 casos
(pinta→negra ×2, roja→pinta).

Este gate lee la VARIANTE del NOMBRE. Contrato conservador (Sacred rule #4 — nunca empeorar hacia un
falso merge, pero tampoco romper matches buenos): devuelve `True` SOLO ante contradicción POSITIVA —
ambos nombres nombran una variante del MISMO grupo y son distintas. Si un solo lado (o ninguno)
nombra variante, o coinciden → `False` (no bloquea).

`_VARIANT_GROUPS` = grupos de valores mutuamente excluyentes que distinguen SKUs. Hoy: el color/tipo
de habichuela (pinta/negra/roja/blanca/verde). Extensible (tipo de arroz, con/sin coco) agregando
grupos. Cada grupo mapea forma-de-superficie → valor canónico para que singular/plural NO cuenten
como conflicto (roja/rojas → "roja"). El match es por PALABRA completa (tokenización), nunca
subcadena — "pintada" no es "pinta".
"""
from __future__ import annotations

import re

_BEAN_COLOR: dict[str, str] = {
    "pinta": "pinta", "pintas": "pinta",
    "negra": "negra", "negras": "negra",
    "roja": "roja", "rojas": "roja",
    "blanca": "blanca", "blancas": "blanca",
    "verde": "verde", "verdes": "verde",
}

_VARIANT_GROUPS: tuple[dict[str, str], ...] = (_BEAN_COLOR,)

_TOKEN_RE = re.compile(r"[a-záéíóúñ]+")


def _values(name: str, group: dict[str, str]) -> set[str]:
    """Valores canónicos del `group` presentes en `name` (match por palabra completa)."""
    return {group[t] for t in _TOKEN_RE.findall(name.casefold()) if t in group}


def variants_conflict(name_a: str, name_b: str) -> bool:
    """`True` = ambos nombres nombran una variante del mismo grupo y difieren (distinto SKU → NO
    auto-linkear). Conservador: un solo lado con variante, o coincidencia → `False`. Ver módulo."""
    for group in _VARIANT_GROUPS:
        values_a = _values(name_a, group)
        values_b = _values(name_b, group)
        if values_a and values_b and values_a.isdisjoint(values_b):
            return True
    return False

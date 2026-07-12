"""Cobertura de Loop B (F3.1), PURO (ADR 31).

Un `CoveragePair` = un (canónico × tienda) que aún NO tiene `store_product` — lo que Loop B tiene que
ir a cubrir (buscar el canónico en esa tienda, validar con la cascada, enlazar). Si ya está vinculado,
no aparece acá (se salta). La versión runtime la deriva el repo por LEFT JOIN; F3.2 la materializa.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CoveragePair:
    canonical_product_id: str
    provider_id: str

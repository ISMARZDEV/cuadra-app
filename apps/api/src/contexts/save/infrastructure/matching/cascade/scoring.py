"""Boost determinístico sobre el score fusionado (RRF) — F2.0 matching cascade. PURA.

Aplica boosts fijos y ADITIVOS cuando el candidato comparte marca y/o tamaño exactos con el
`store_product` que se intenta enlazar (ver design §Score fusion: "fuse RRF, then weighted
boost — exact brand/size match"). El resultado se clampa a [0.0, 1.0] para seguir siendo
comparable contra los umbrales de banding (HIGH=0.85, MID=0.55, ver `banding.py`).

Los boosts son constantes nombradas para poder afinarlos más adelante (post curated-basket
labels) sin tocar la lógica de aplicación.
"""
from __future__ import annotations

BRAND_EXACT_MATCH_BOOST = 0.10
SIZE_EXACT_MATCH_BOOST = 0.05


def apply_boosts(
    base_score: float,
    *,
    brand_exact_match: bool = False,
    size_exact_match: bool = False,
) -> float:
    """Aplica los boosts deterministas sobre `base_score` (el score fusionado por RRF)."""
    score = base_score
    if brand_exact_match:
        score += BRAND_EXACT_MATCH_BOOST
    if size_exact_match:
        score += SIZE_EXACT_MATCH_BOOST
    return min(score, 1.0)

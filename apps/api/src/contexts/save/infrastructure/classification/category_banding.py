"""Banding PROPIO del clasificador de categoría — por MARGEN del vector, no por score absoluto.

Por qué no reusa `determine_band` del matching (0.85/0.55): esos umbrales calibran una comparación
producto↔producto. El clasificador compara producto↔hoja-de-taxonomía, otra distribución — medido
(120 hojas × 30 productos, receta descriptiva): los scores del ACIERTO viven en 0.41–0.61 (0.85 es
inalcanzable) y SE SOLAPAN con los del fallo, así que un umbral de score absoluto no separa nada.

Lo que SÍ separa es el MARGEN del vector (top1 − top2): auto-clasificar solo cuando el ganador
semántico destaca CLARO del segundo. Medido sobre la etapa fuzzy (12 productos que el léxico no
resolvió): margen ≥ 0.03 → 6 auto-clasificados, 0 errores (100% precisión). Comparación:
  RRF(trgm,vector) ganador  → 17% precisión (el trgm de categorías no ve los `terms` → contamina).
  solo-vector top1          → 67%.
  margen-vector ≥ 0.03      → 100%.
Por eso el clasificador auto-linkea por VECTOR-con-margen y descarta la fusión RRF/trgm.

`CATEGORY_MARGIN_THRESHOLD` es provisional (12 casos) — se afinará con el labeled set del basket,
igual que los umbrales del matching. Sin margen → banda "grey": con el juez apagado (decisión de
producto), la banda grey NO clasifica (no inventa categoría, regla sagrada).
"""
from __future__ import annotations

from typing import Literal

from ...domain.classification import CategoryCandidate

CATEGORY_MARGIN_THRESHOLD = 0.03

CategoryBand = Literal["auto_link", "grey", "human"]


def decide_by_vector_margin(
    vector_candidates: list[CategoryCandidate],
) -> tuple[str | None, float, CategoryBand]:
    """(winner_id | None, score_del_ganador, banda) a partir de los candidatos VECTOR ordenados desc.

    - sin candidatos            → (None, 0.0, "human")
    - margen top1−top2 ≥ umbral → (winner, score, "auto_link")   ← 1 solo candidato = margen pleno
    - margen fino               → (None, score, "grey")          ← sin juez, no clasifica
    """
    if not vector_candidates:
        return None, 0.0, "human"
    top = vector_candidates[0]
    runner_up = vector_candidates[1].score if len(vector_candidates) > 1 else 0.0
    margin = top.score - runner_up
    if margin >= CATEGORY_MARGIN_THRESHOLD:
        return top.taxonomy_node_id, top.score, "auto_link"
    return None, top.score, "grey"

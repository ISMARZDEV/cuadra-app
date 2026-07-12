"""Category gate/boost de la cascada de matching (PURO) — Etapa C (save-category-classification).

La categoría es una segunda señal ortogonal al nombre/EAN/tamaño: dos productos de categorías
distintas casi nunca son el MISMO SKU. Se usa en dos formas, espejando el patrón de `size_gate`
(señal dura) + los boosts de marca/tamaño (señal blanda):

- **Gate a nivel PADRE** (`categories_conflict`): store y candidato canónico en padres DISTINTOS →
  señal dura de SKU distinto → NUNCA auto-linkear (va a revisión). A nivel padre (no hoja) para no
  romper matches buenos por ruido de la clasificación de subcategoría.
- **Boost a nivel HOJA** (`category_boost`): misma hoja exacta → refuerzo de confianza.

Contrato conservador (Sacred rule #4 — nunca romper un match bueno por falta de datos): ante
CUALQUIER categoría desconocida (store sin clasificar, canónico sin padre resoluble) devuelve
`False`/`0.0` — no bloquea ni refuerza, deja el comportamiento actual intacto.
"""
from __future__ import annotations

# Refuerzo por misma hoja — mismo orden de magnitud que los boosts de marca/tamaño (0.05), aditivo.
CATEGORY_BOOST = 0.05


def categories_conflict(store_parent_id: str | None, canonical_parent_id: str | None) -> bool:
    """`True` = ambos padres CONOCIDOS y distintos → distinto SKU, NO auto-linkear. Ante cualquier
    desconocido → `False` (no bloquea)."""
    if not store_parent_id or not canonical_parent_id:
        return False
    return store_parent_id != canonical_parent_id


def category_boost(store_leaf_id: str | None, canonical_leaf_id: str | None) -> float:
    """Refuerzo si ambas hojas son CONOCIDAS e iguales; `0.0` si difieren o alguna es desconocida."""
    if store_leaf_id and canonical_leaf_id and store_leaf_id == canonical_leaf_id:
        return CATEGORY_BOOST
    return 0.0

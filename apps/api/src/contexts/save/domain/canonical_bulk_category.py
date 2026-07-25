"""Sugerencias de categoría sobre un CONJUNTO de canónicos (F5, US-CP-L10). PURO (ADR 31).

El SDD pide algo distinto de sugerir producto por producto: agregar las señales del lote y
**advertir si los seleccionados parecen de categorías distintas**.

Esa advertencia es el punto. El flujo previsto es «filtro Sin categoría → seleccionar el grupo
homogéneo → asignar → repetir», y asignar una sola categoría a un lote heterogéneo ensucia varios
productos de un saque — bastante más caro de deshacer que de evitar.

No decide nada: rankea y avisa. La asignación sigue siendo del humano, y se registra como suya.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .category_suggestion import CategorySuggestion


@dataclass(frozen=True, slots=True)
class BulkCategorySuggestion:
    """Una hoja propuesta para el LOTE, con cuántos de los seleccionados la apoyan."""

    taxonomy_node_id: str
    product_count: int
    matched_tokens: list[str] = field(default_factory=list)
    signal: str = "lexicon"


@dataclass(frozen=True, slots=True)
class BulkCategoryAdvice:
    """Qué proponer para el lote y qué advertir antes de aplicarlo."""

    suggestions: list[BulkCategorySuggestion] = field(default_factory=list)
    # Los productos seleccionados apuntan a hojas DISTINTAS: asignar una sola los ensuciaría.
    heterogeneous: bool = False
    # Cuántos de los seleccionados no tienen ninguna señal léxica. Dato honesto: son los que el
    # operador clasificaría a ciegas.
    without_signal: int = 0


def aggregate_category_suggestions(
    per_product: dict[str, list[CategorySuggestion]],
    *,
    limit: int = 5,
) -> BulkCategoryAdvice:
    """Sugerencias por producto → propuesta del lote + advertencia de heterogeneidad."""
    counts: dict[str, int] = {}
    tokens: dict[str, set[str]] = {}
    top_leaves: set[str] = set()
    without_signal = 0

    for suggestions in per_product.values():
        if not suggestions:
            # Sin señal NO es lo mismo que con una señal distinta: son justo los productos que el
            # operador está tratando de clasificar, y contarlos como conflicto haría que el lote
            # se marcara heterogéneo siempre.
            without_signal += 1
            continue
        # Sólo la PRIMERA decide heterogeneidad: un producto puede pegar dos hojas por tener dos
        # tokens, y eso no lo vuelve incompatible con el resto.
        top_leaves.add(suggestions[0].taxonomy_node_id)
        for suggestion in suggestions:
            counts[suggestion.taxonomy_node_id] = counts.get(suggestion.taxonomy_node_id, 0) + 1
            tokens.setdefault(suggestion.taxonomy_node_id, set()).update(
                suggestion.matched_tokens
            )

    ranked = [
        BulkCategorySuggestion(
            taxonomy_node_id=node_id,
            product_count=count,
            matched_tokens=sorted(tokens.get(node_id, set())),
        )
        for node_id, count in counts.items()
    ]
    # Rankea por CUÁNTOS PRODUCTOS apoyan la hoja, no por tokens: en bulk lo que importa es el
    # consenso del lote, no lo descriptivo que sea el nombre de un producto suelto.
    ranked.sort(key=lambda s: (-s.product_count, s.taxonomy_node_id))

    return BulkCategoryAdvice(
        suggestions=ranked[:limit],
        heterogeneous=len(top_leaves) > 1,
        without_signal=without_signal,
    )

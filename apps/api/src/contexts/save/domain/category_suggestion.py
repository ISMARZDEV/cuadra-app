"""Sugerencia de categoría — concepto de DOMINIO (ADR 31). PURO.

Vive acá y no en el léxico porque "una hoja propuesta CON la evidencia que la sostiene" es una
idea del dominio, no de una técnica: el léxico es sólo el ADAPTADOR que hoy la produce. Mañana
puede producirla la etapa vectorial o el juez, y nada de lo que consume sugerencias debería
enterarse.

Fue el contrato de import-linter el que forzó esta separación: `domain/canonical_bulk_category`
importaba este tipo desde `infrastructure/classification/lexicon`, que es exactamente lo que ADR 31
prohíbe.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class CategorySuggestion:
    """Una hoja propuesta al operador, CON la evidencia que la sostiene (US-CP-D2c).

    `matched_tokens` no es decorativo: es la "señal de origen" que el SDD exige para que la
    sugerencia sea una decisión informada y no una caja negra.
    """

    taxonomy_node_id: str
    matched_tokens: list[str] = field(default_factory=list)
    signal: str = "lexicon"

    @property
    def strength(self) -> int:
        """Cuántos tokens distintos apuntan a esta hoja."""
        return len(self.matched_tokens)

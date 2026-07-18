"""Use case `GenerateCategoryTerms`: backfill offline de `taxonomy_node.classification_terms`.

Para cada hoja (level=1) SIN términos, pide al generador (LLM, offline) los descriptores del dominio
("arroz, habichuelas, guandules") y los persiste. Esos términos alimentan la receta de embedding del
clasificador (`build_category_embedding_text`), que sube el top-1 de 43% a 77% (medido, 120 hojas).

- **Idempotente**: `leaves_without_terms` excluye las ya sembradas → re-correr no re-genera ni re-paga.
- **Invalida el vector**: `set_terms` pone `embedding=NULL` (el input del embedding cambió), así la
  próxima corrida de `EmbedCategories` la re-embebe con la receta descriptiva. Sin flag "dirty".
- **No inventa**: si el generador devuelve vacío (LLM degradado), NO persiste — la hoja se reintenta.

Corre UNA vez offline (CLI seed), no en la ingesta caliente: es curación de catálogo, revisable
después desde el admin. Determinista una vez sembrado.
"""
from __future__ import annotations

from ..domain.ports.repositories import CategoryIndexRepository, CategoryTermsGenerator


class GenerateCategoryTerms:
    def __init__(
        self, index_repo: CategoryIndexRepository, generator: CategoryTermsGenerator
    ) -> None:
        self._repo = index_repo
        self._generator = generator

    def execute(self, market_id: str, batch_size: int = 50) -> int:
        """Genera y persiste términos para las hojas que no los tienen. Devuelve cuántas sembró."""
        total = 0
        while True:
            batch = self._repo.leaves_without_terms(market_id, limit=batch_size)
            if not batch:
                break
            persisted_this_batch = 0
            for node_id, name, parent in batch:
                terms = self._generator.generate(name, parent)
                if not terms or not terms.strip():
                    continue  # LLM no produjo nada útil → no persistir basura, reintentar luego
                self._repo.set_terms(node_id, terms.strip())
                persisted_this_batch += 1
            total += persisted_this_batch
            # Si nada de este lote se persistió, otra pasada devolvería el MISMO lote → corta el loop.
            if persisted_this_batch == 0 or len(batch) < batch_size:
                break
        return total

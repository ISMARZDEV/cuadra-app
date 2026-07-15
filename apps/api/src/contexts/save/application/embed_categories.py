"""Use case `EmbedCategories`: backfill del índice semántico de categorías (save-category-classification).

Embebe las hojas de taxonomía (nivel 1) sin `embedding` vía el `EmbeddingProvider`, con la receta
`build_category_embedding_text` (padre + subcategoría, para contexto). Sin esto, la etapa vectorial
del clasificador (`find_leaves_vector`, filtro `embedding IS NOT NULL`) es INERTE. Idempotente:
`leaves_without_embedding` excluye las ya embebidas. Se corre en la ingesta (composición) gated por
el flag ship-dark. Mismo modelo BGE-M3 que `canonical_product.embedding`.
"""
from __future__ import annotations

from ..domain.ports.repositories import CategoryIndexRepository, EmbeddingProvider
from ..infrastructure.classification.category_embedding_text import build_category_embedding_text


class EmbedCategories:
    def __init__(self, index_repo: CategoryIndexRepository, embedder: EmbeddingProvider) -> None:
        self._repo = index_repo
        self._embedder = embedder

    def execute(self, market_id: str, batch_size: int = 128) -> int:
        """Embebe en lotes hasta que no queden hojas sin embedding. Devuelve cuántas embebió."""
        total = 0
        while True:
            batch = self._repo.leaves_without_embedding(market_id, limit=batch_size)
            if not batch:
                break
            texts = [build_category_embedding_text(name, parent) for _id, name, parent in batch]
            vectors = self._embedder.embed(texts)
            for (node_id, _name, _parent), vector in zip(batch, vectors, strict=True):
                self._repo.set_embedding(node_id, vector)
            total += len(batch)
            if len(batch) < batch_size:
                break
        return total

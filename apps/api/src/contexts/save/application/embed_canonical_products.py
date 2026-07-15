"""Use case `EmbedCanonicalProducts`: backfill del índice semántico de la cascada de matching (F2.0).

Embebe los `canonical_product` con `embedding` NULL vía el `EmbeddingProvider` y los persiste. Sin
esto, la etapa vectorial (`find_candidates_vector`, filtro `embedding IS NOT NULL`) es INERTE — nunca
devuelve candidatos — y la cascada pierde su blocking semántico (queda solo EAN+trgm+juez). Se corre
en la ingesta ANTES del matching (composición en `ingestion/save/composition.py`).

Usa la MISMA receta de texto (`build_embedding_text`) que el lado query en `MatchStoreProduct`, o los
vectores no serían comparables. Idempotente: `list_without_embedding` excluye los ya embebidos, así
que re-correrlo solo procesa lo nuevo (p.ej. canónicos creados desde la cola de revisión).
"""
from __future__ import annotations

from ..domain.ports import CanonicalProductRepository
from ..domain.ports.repositories import EmbeddingProvider
from ..infrastructure.matching.cascade.embedding_text import build_embedding_text


class EmbedCanonicalProducts:
    def __init__(
        self, canonical_repo: CanonicalProductRepository, embedder: EmbeddingProvider
    ) -> None:
        self._repo = canonical_repo
        self._embedder = embedder

    def execute(self, market_id: str, batch_size: int = 128) -> int:
        """Embebe en lotes hasta que no queden canónicos sin embedding. Devuelve cuántos embebió."""
        total = 0
        while True:
            batch = self._repo.list_without_embedding(market_id, limit=batch_size)
            if not batch:
                break
            texts = [
                build_embedding_text(c.name, c.brand, c.display_size or "") for c in batch
            ]
            vectors = self._embedder.embed(texts)
            for canonical, vector in zip(batch, vectors, strict=True):
                self._repo.set_embedding(canonical.id, vector)
            total += len(batch)
            if len(batch) < batch_size:
                break
        return total

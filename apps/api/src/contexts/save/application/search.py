"""Use case SearchProducts (§6): búsqueda HÍBRIDA de productos canónicos en un mercado.

Dos etapas heterogéneas fusionadas por RRF:

  léxica (pg_trgm sobre nombre + marca)  ─┐
                                          ├─► RRF ─► top-N ─► hidratación
  semántica (pgvector / BGE-M3)          ─┘

La léxica atrapa marca y tamaño exactos; la semántica atrapa sinónimos regionales y typos
(«arros», «habichuela» vs «frijol»). Ninguna sola alcanza: el `ILIKE '%q%'` anterior devolvía
CERO para cualquiera de esos casos.

Sin embedder la etapa semántica se OMITE (§6.5) — nunca se alimenta un vector inventado, que
devolvería vecinos arbitrarios y RRF los fusionaría como candidatos legítimos. La búsqueda
empeora de forma honesta en vez de mentir.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Protocol

from ..domain.entities import MatchCandidate
from ..domain.ports import CanonicalProductRepository
from ..domain.rank_fusion import reciprocal_rank_fusion
from .dtos import ProductSearchDto

logger = logging.getLogger(__name__)

# Candidatos que pide cada etapa antes de fusionar. Holgado a propósito: RRF necesita ver la cola
# de cada lista para que el consenso entre etapas signifique algo.
_CANDIDATES_PER_STAGE = 20
_DEFAULT_LIMIT = 5


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SearchProducts:
    def __init__(
        self,
        canonical_repo: CanonicalProductRepository,
        *,
        embedding_provider: EmbeddingProvider | None = None,
        limit: int = _DEFAULT_LIMIT,
    ) -> None:
        self._repo = canonical_repo
        self._embedder = embedding_provider
        self._limit = limit

    def execute(self, query: str, market_id: str) -> list[ProductSearchDto]:
        text = query.strip()
        if not text:
            return []

        lexical = self._repo.search_lexical(text, market_id, limit=_CANDIDATES_PER_STAGE)
        semantic = self._semantic(text, market_id)

        fused = reciprocal_rank_fusion(lexical, semantic)[: self._limit]
        ranked_ids = [c.canonical_product_id for c in fused]

        found = {p.id: p for p in self._repo.get_many(ranked_ids, market_id)}
        # El orden lo impone la fusión: `get_many` no promete ninguno. Un id que ya no está
        # (archivado entre las dos queries) se omite en vez de romper la respuesta.
        return [ProductSearchDto.from_entity(found[pid]) for pid in ranked_ids if pid in found]

    def _semantic(self, text: str, market_id: str) -> Sequence[MatchCandidate]:
        if self._embedder is None:
            return []
        try:
            embedding = self._embedder.embed([text])[0]
        except Exception:  # noqa: BLE001 — el endpoint caído degrada la búsqueda, no la tumba
            logger.warning("search: la etapa semántica falló; se degrada a léxica", exc_info=True)
            return []
        return self._repo.search_semantic(embedding, market_id, limit=_CANDIDATES_PER_STAGE)

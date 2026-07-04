"""Use case SearchProducts (§6): busca productos canónicos por texto en un mercado."""
from __future__ import annotations

from ..domain.ports import CanonicalProductRepository
from .dtos import ProductSearchDto


class SearchProducts:
    def __init__(self, canonical_repo: CanonicalProductRepository) -> None:
        self._repo = canonical_repo

    def execute(self, query: str, market_id: str) -> list[ProductSearchDto]:
        return [ProductSearchDto.from_entity(p) for p in self._repo.search(query, market_id)]

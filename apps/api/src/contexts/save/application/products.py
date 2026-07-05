"""Use case ListProducts (§6): lista los productos canónicos de un mercado.

Alimenta el sitemap.xml del portal (SEO: Google descubre las páginas de producto) y el browse
futuro. Solo lectura; el DTO reusa ProductSearchDto (id/name/brand).
"""
from __future__ import annotations

from ..domain.ports import CanonicalProductRepository
from .dtos import ProductSearchDto


class ListProducts:
    def __init__(self, canonical_repo: CanonicalProductRepository) -> None:
        self._repo = canonical_repo

    def execute(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[ProductSearchDto]:
        products = self._repo.list_by_market(market_id, limit=limit, offset=offset)
        return [ProductSearchDto.from_entity(p) for p in products]

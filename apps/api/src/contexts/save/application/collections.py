"""Use cases de colecciones curadas (A6): rails de la home + página propia por colección.

La curaduría es hand-pick: el repo entrega los canonical_product_id en orden (`position`). Reusa la
agregación producto×tienda de `listing` (_aggregate/_to_card/_discount_map) para armar las cards con
precio mínimo y el badge "−X%" — NO duplica esa money-math. Productos sin oferta vigente se
descartan; colecciones que quedan vacías no se listan (no mostramos rails vacíos). Solo lectura.
"""
from __future__ import annotations

from ..domain.ports import CollectionRepository, StoreProductRepository
from .dtos import CollectionDto
from .listing import _aggregate, _discount_map, _to_card


class ListCollections:
    """Rails curados de la home: cada colección con sus primeros `per_rail` productos."""

    def __init__(
        self, collection_repo: CollectionRepository, store_repo: StoreProductRepository
    ) -> None:
        self._collections = collection_repo
        self._store = store_repo

    def execute(self, market_id: str, *, per_rail: int = 12) -> list[CollectionDto]:
        products = _aggregate(self._store.list_market_offerings(market_id))
        disc = _discount_map(self._store, market_id)
        out: list[CollectionDto] = []
        for c in self._collections.list_by_market(market_id):
            cards = [
                _to_card(products[pid], disc.get(pid))
                for pid in self._collections.list_product_ids(c.id)
                if pid in products
            ][:per_rail]
            if cards:
                out.append(CollectionDto(slug=c.slug, name=c.name, products=cards))
        return out


class GetCollection:
    """Página propia de una colección: TODOS sus productos hand-pick, en orden."""

    def __init__(
        self, collection_repo: CollectionRepository, store_repo: StoreProductRepository
    ) -> None:
        self._collections = collection_repo
        self._store = store_repo

    def execute(self, slug: str, market_id: str) -> CollectionDto | None:
        collection = self._collections.get_by_slug(slug, market_id)
        if collection is None:
            return None
        products = _aggregate(self._store.list_market_offerings(market_id))
        disc = _discount_map(self._store, market_id)
        cards = [
            _to_card(products[pid], disc.get(pid))
            for pid in self._collections.list_product_ids(collection.id)
            if pid in products
        ]
        return CollectionDto(slug=collection.slug, name=collection.name, products=cards)

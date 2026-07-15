"""Use case CreateCanonicalAndLink (F2 · B1, tareas 1.15-1.16): el revisor decide que NINGÚN
candidato ofrecido (`review_candidate`) es el producto correcto, así que crea un `canonical_product`
nuevo y enlaza el `product_match` pendiente a él, en un solo flujo.

NO reimplementa el invariante de misma-transacción (FK denormalizado + `product_match` en la
MISMA Session/UoW) — compone con `ResolveReview` (F2·B1), que es el único dueño de esa frontera
transaccional. Este use case solo agrega el paso previo: `CanonicalProductRepository.add(...)`
(slug autogen, ver `SqlCanonicalProductRepository._unique_slug`).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from ..domain.entities import CanonicalProduct
from ..domain.ports import CanonicalProductRepository
from ..domain.value_objects import Quantity
from .resolve_review import ResolveReview


@dataclass(frozen=True, slots=True)
class NewCanonicalProduct:
    """Datos de entrada para el canónico nuevo — sin `id`/`slug` (los asigna la infra al persistir)."""

    name: str
    brand: str
    quantity: Quantity
    taxonomy_node_id: str
    market_id: str
    quality: str | None = None
    display_size: str | None = None
    image_url: str | None = None


class CreateCanonicalAndLink:
    def __init__(
        self, *, canonical_repo: CanonicalProductRepository, resolver: ResolveReview
    ) -> None:
        self._canonical_repo = canonical_repo
        self._resolver = resolver

    def execute(self, *, match_id: str, product: NewCanonicalProduct, decided_by: str) -> str:
        canonical_id = str(uuid.uuid4())
        self._canonical_repo.add(
            CanonicalProduct(
                canonical_id,
                product.name,
                product.brand,
                product.quantity,
                product.taxonomy_node_id,
                product.market_id,
                quality=product.quality,
                display_size=product.display_size,
                image_url=product.image_url,
            )
        )
        # Mismo invariante de misma-transacción que `_auto_link`/`ResolveReview`: si esta escritura
        # (FK denormalizado + product_match) fallara, el `add` de arriba comparte la misma Session
        # y se revierte junto con ella — no hay commit intermedio.
        self._resolver.execute(
            match_id=match_id, canonical_product_id=canonical_id, decided_by=decided_by
        )
        return canonical_id

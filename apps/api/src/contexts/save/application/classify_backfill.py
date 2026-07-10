"""Use case `ClassifyBackfill` — clasifica en lote los productos sin categoría `active`.

Corre sobre `store_product` (todos los reales) o `canonical_product` con NULL. Estrategia
**snapshot-then-classify**: primero LEE todo lo sin clasificar (paginado por offset, orden estable),
LUEGO clasifica. Así un producto que queda SIN resolver (juez uncertain / banda human, que no
persiste fila) NO se re-encola infinitamente — el snapshot se tomó antes de mutar. Idempotente
entre corridas: una 2ª pasada solo ve lo que sigue sin `active`.
"""
from __future__ import annotations

from ..domain.ports.repositories import CategoryClassificationRepository
from .classify_store_product import ClassifyStoreProduct


class ClassifyBackfill:
    def __init__(
        self,
        classifications: CategoryClassificationRepository,
        classifier: ClassifyStoreProduct,
    ) -> None:
        self._classifications = classifications
        self._classifier = classifier

    def execute(self, market_id: str, *, is_canonical: bool, batch_size: int = 128) -> int:
        """Clasifica todos los productos sin `active`. Devuelve cuántos procesó."""
        # Fase 1 — snapshot (solo lectura, no muta → sin desplazamiento de la ventana)
        products = []
        offset = 0
        while True:
            page = self._classifications.list_unclassified(
                market_id, is_canonical=is_canonical, limit=batch_size, offset=offset
            )
            if not page:
                break
            products.extend(page)
            offset += len(page)
            if len(page) < batch_size:
                break
        # Fase 2 — clasificar (muta)
        for product in products:
            self._classifier.execute(product, market_id)
        return len(products)

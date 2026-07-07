"""Use case GetReviewDetail (F2 · B1, tareas 1.19-1.20): detalle de un `product_match` para la
UI de comparación de la consola de administración (design §Backend Interfaces) — atributos crudos
del `store_product` (F2·B1 1.9-1.10) + candidatos `review_candidate` persistidos (1.11-1.12).

Candidatos vacíos NUNCA es un error: una fila LEGACY (persistida antes del wiring de candidatos,
batch 1c) o una decisión que nunca los llamó simplemente no tiene ninguno — el diff de la UI
debe mostrar "sin candidatos", no reventar.
"""
from __future__ import annotations

from ..domain.ports import StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository
from ..domain.review_queue import ReviewDetail


class GetReviewDetail:
    def __init__(
        self, *, match_repo: ProductMatchRepository, store_repo: StoreProductRepository
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo

    def execute(self, match_id: str) -> ReviewDetail | None:
        match = self._match_repo.get_by_id(match_id)
        if match is None:
            return None

        raw_attrs = self._store_repo.get_raw_attrs(match.store_product_id)
        candidates = self._match_repo.list_candidates(match_id)

        return ReviewDetail(
            match_id=match_id,
            store_product_id=match.store_product_id,
            confidence=match.confidence,
            method=match.method,
            store_product_name=raw_attrs.name if raw_attrs else None,
            store_product_brand=raw_attrs.brand if raw_attrs else None,
            store_product_size_text=raw_attrs.size_text if raw_attrs else None,
            store_product_image_url=raw_attrs.image_url if raw_attrs else None,
            candidates=candidates,
        )

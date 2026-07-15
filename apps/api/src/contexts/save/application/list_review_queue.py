"""Use case ListReviewQueue (F2 · B1, tareas 1.17-1.18): lista paginada/filtrable de
`product_match` `pending_review` para la consola de administración (design §Backend Interfaces).

Delgado a propósito: el orden (incertidumbre-primero por defecto, FIFO por override), los
filtros y la paginación se resuelven EN SQL dentro del repo (`ProductMatchRepository.list_review_queue`)
para que `total` sea correcto contra `limit`/`offset` reales — este use case solo desempaqueta
`confidence_range` en los dos límites que el puerto espera.
"""
from __future__ import annotations

from ..domain.ports.repositories import ProductMatchRepository
from ..domain.review_queue import ReviewQueueRow


class ListReviewQueue:
    def __init__(self, match_repo: ProductMatchRepository) -> None:
        self._match_repo = match_repo

    def execute(
        self,
        market_id: str,
        *,
        provider_id: str | None = None,
        method: str | None = None,
        confidence_range: tuple[float, float] | None = None,
        order_by: str = "uncertainty",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ReviewQueueRow], int]:
        confidence_min, confidence_max = confidence_range if confidence_range else (None, None)
        return self._match_repo.list_review_queue(
            market_id,
            provider_id=provider_id,
            method=method,
            confidence_min=confidence_min,
            confidence_max=confidence_max,
            order_by=order_by,
            limit=limit,
            offset=offset,
        )

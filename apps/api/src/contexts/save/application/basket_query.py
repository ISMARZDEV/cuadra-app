"""Use cases de BasketQuery (canasta curada): CRUD (F2·B1/B3, Batch 3D, tareas 3.13-3.15).

`BasketQuery` reemplaza `BASKET_QUERIES` hardcodeado en `ingestion/save/sources.py` — la canasta
la mantiene ahora un admin desde la consola (`ADMIN_SAVE_INGESTION_OPS`), no un deploy de código.
`RemoveBasketQuery` borra la fila (poda dura: la query sale definitivamente de la canasta);
`UpdateBasketQuery` puede alternar `active` (soft-disable, sin perder el registro histórico) —
ambos son legítimos (features.md #14): un admin puede podar duro o pausar temporalmente.
"""
from __future__ import annotations

import uuid

from ..domain.entities import BasketQuery
from ..domain.ports import BasketQueryRepository


class CreateBasketQuery:
    """Alta de una query de la canasta curada — id lo asigna el use case (UUID), no la infra.

    Falla si `(market_id, query_text)` ya existe (`uq_basket_query_market_text`) — chequeo previo,
    mismo patrón que `CreateSource` (F2·B1/B3, Batch 3B)."""

    def __init__(self, repo: BasketQueryRepository) -> None:
        self._repo = repo

    def execute(
        self,
        *,
        market_id: str,
        query_text: str,
        category_label: str | None = None,
        position: int = 0,
        active: bool = True,
    ) -> BasketQuery:
        if self._repo.get_by_market_and_text(market_id, query_text) is not None:
            raise ValueError(
                f"Ya existe una query para este mercado: {market_id!r} / {query_text!r}"
            )
        query = BasketQuery(
            str(uuid.uuid4()), market_id, query_text,
            category_label=category_label, position=position, active=active,
        )
        self._repo.add(query)
        return query


class UpdateBasketQuery:
    """Actualiza category_label/query_text/position/active de una query existente.

    Semántica PATCH: un argumento en `None` deja el campo sin tocar (mismo patrón que
    `UpdateSource`) — no hay forma de "borrar" `category_label` con este método."""

    def __init__(self, repo: BasketQueryRepository) -> None:
        self._repo = repo

    def execute(
        self,
        query_id: str,
        *,
        category_label: str | None = None,
        query_text: str | None = None,
        position: int | None = None,
        active: bool | None = None,
    ) -> BasketQuery:
        existing = self._repo.get_by_id(query_id)
        if existing is None:
            raise ValueError(f"Query no encontrada: {query_id!r}")
        updated = BasketQuery(
            existing.id,
            existing.market_id,
            query_text if query_text is not None else existing.query_text,
            category_label=(
                category_label if category_label is not None else existing.category_label
            ),
            position=position if position is not None else existing.position,
            active=active if active is not None else existing.active,
        )
        self._repo.update(updated)
        return updated


class RemoveBasketQuery:
    """Poda dura: borra la fila — la query sale definitivamente de la canasta curada."""

    def __init__(self, repo: BasketQueryRepository) -> None:
        self._repo = repo

    def execute(self, query_id: str) -> None:
        existing = self._repo.get_by_id(query_id)
        if existing is None:
            raise ValueError(f"Query no encontrada: {query_id!r}")
        self._repo.remove(query_id)


class ListBasketQueries:
    """Canasta curada de un mercado, en orden de `position` (consola admin)."""

    def __init__(self, repo: BasketQueryRepository) -> None:
        self._repo = repo

    def execute(self, market_id: str) -> list[BasketQuery]:
        return self._repo.list_by_market(market_id)

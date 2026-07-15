"""ResolveReview — cierra el bug de F2.0 (ver design `sdd/save-admin-review`, F2·B1): el
`resolve_review` del repo cambiaba `product_match.status` pero NUNCA escribía
`store_product.canonical_product_id`, dejando el FK denormalizado sin enlazar en el camino de
APROBACIÓN HUMANA (la cascada automática sí lo hacía bien vía `_auto_link`, F2.0). Sin impacto en
producción — la cascada sigue ship-dark.

Mismo invariante de misma-transacción que `_auto_link` (`match_store_product.py`): ambas
escrituras — el FK denormalizado y el `product_match` — se disparan aquí, contra los mismos
colaboradores inyectados (misma Session/UoW en producción); este use case es el dueño de la
frontera transaccional, no la infraestructura.
"""
from __future__ import annotations

from ..domain.ports import StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository


class ResolveReview:
    def __init__(
        self, match_repo: ProductMatchRepository, store_repo: StoreProductRepository
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo

    def execute(
        self,
        *,
        match_id: str,
        canonical_product_id: str | None,
        decided_by: str,
        reason_code: str | None = None,
        reason_note: str | None = None,
    ) -> None:
        # Regla sagrada #4 (nada débil auto-mergea) aplicada al camino humano: rechazar sin motivo
        # no es una decisión trazable — se bloquea ANTES de tocar cualquier repo (sin escritura).
        if canonical_product_id is None and not (reason_code and reason_code.strip()):
            raise ValueError(
                "reason_code es requerido al rechazar un match (product_match.status='rejected')"
            )

        match = self._match_repo.get_by_id(match_id)
        if match is None:
            raise ValueError(f"product_match no encontrado: {match_id!r}")

        if canonical_product_id is not None:
            # Invariante de misma-transacción: si esta escritura falla (p.ej. canonical_product_id
            # inexistente -> viola el FK), la excepción propaga y `resolve_review` de abajo NUNCA
            # se ejecuta — ninguna escritura parcial persiste.
            self._store_repo.link_to_canonical(match.store_product_id, canonical_product_id)

        self._match_repo.resolve_review(
            match_id,
            canonical_product_id,
            decided_by,
            reason_code=reason_code,
            reason_note=reason_note,
        )

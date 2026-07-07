"""BulkResolveReview (F2 · B1, tareas 1.24-1.25): resuelve N filas de la cola de revisión en un
solo request, cada fila de forma ATÓMICA e INDEPENDIENTE de las demás. El fallo de una fila
(`canonical_product_id` inexistente, `reason_code` faltante al rechazar, etc.) NUNCA debe
arrastrar ni silenciar las demás — se reporta éxito parcial explícito (`succeeded`/`failed` con
motivo), en vez de abortar todo el lote o tragarse el error.

No reimplementa el invariante de misma-transacción de `ResolveReview` (FK denormalizado +
`product_match` en una sola escritura) — lo envuelve en un SAVEPOINT por fila (`begin_nested`,
puerto `NestedTransactionScope`) para que el rollback de UNA fila no deshaga las filas ya
confirmadas del mismo lote/misma Session.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..domain.ports.transaction import NestedTransactionScope
from .resolve_review import ResolveReview


@dataclass(frozen=True, slots=True)
class BulkResolveRow:
    match_id: str
    canonical_product_id: str | None
    decided_by: str
    reason_code: str | None = None
    reason_note: str | None = None


@dataclass(frozen=True, slots=True)
class BulkResolveFailure:
    match_id: str
    error: str


@dataclass(frozen=True, slots=True)
class BulkResolveResult:
    succeeded: list[str] = field(default_factory=list)
    failed: list[BulkResolveFailure] = field(default_factory=list)


class BulkResolveReview:
    def __init__(self, *, scope: NestedTransactionScope, resolver: ResolveReview) -> None:
        self._scope = scope
        self._resolver = resolver

    def execute(self, rows: list[BulkResolveRow]) -> BulkResolveResult:
        succeeded: list[str] = []
        failed: list[BulkResolveFailure] = []
        for row in rows:
            try:
                with self._scope.begin_nested():
                    self._resolver.execute(
                        match_id=row.match_id,
                        canonical_product_id=row.canonical_product_id,
                        decided_by=row.decided_by,
                        reason_code=row.reason_code,
                        reason_note=row.reason_note,
                    )
            except Exception as exc:  # aislar el fallo de ESTA fila, nunca abortar el lote
                failed.append(BulkResolveFailure(match_id=row.match_id, error=str(exc)))
            else:
                succeeded.append(row.match_id)
        return BulkResolveResult(succeeded=succeeded, failed=failed)

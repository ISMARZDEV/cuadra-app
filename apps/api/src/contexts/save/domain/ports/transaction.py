"""Puerto mínimo de UoW (ADR 31, DIP): un scope que abre un SAVEPOINT anidado.

Usado por `BulkResolveReview` (F2 · B1, tarea 1.24-1.25) para acotar el rollback de una fila
del lote a ESA fila — sin deshacer las filas ya confirmadas del mismo lote/misma Session (mismo
patrón ya usado a nivel de test en `test_resolve_review.py::test_approve_with_nonexistent_canonical_rolls_back_both_writes`).

`sqlalchemy.orm.Session` satisface este Protocol de forma estructural (ya expone `begin_nested`)
— no hace falta un adaptador de infraestructura, se inyecta la Session tal cual desde el
composition_root, tipada de forma angosta.
"""
from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol


class NestedTransactionScope(Protocol):
    def begin_nested(self) -> AbstractContextManager[object]: ...

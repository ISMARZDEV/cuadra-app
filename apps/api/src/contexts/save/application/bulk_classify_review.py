"""`BulkClassifyReview` — clasifica en lote las filas seleccionadas de la cola de revisión.

Existe porque la cola en arranque en frío es una tarea de SIEMBRA de catálogo, no de revisión caso
a caso: con el catálogo canónico vacío nada matchea, todo cae a revisión, y el operador necesita
agrupar antes de decidir. La categoría es lo que agrupa.

Espeja `BulkResolveReview` en lo estructural (SAVEPOINT por fila, éxito parcial explícito) y le
agrega el RESUMEN: cuántas quedaron clasificadas y cuántas siguen sin decidir. Ese número no es
decoración — el clasificador deja huecos A PROPÓSITO (banda gris / conflicto de señales / sin la
etapa vectorial), así que un lote que resuelve 32 de 48 es el caso NORMAL. Sin decirlo, el operador
creería que ya no le queda nada por mirar.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from ..domain.classification import ClassifiableProduct
from ..domain.ports.transaction import NestedTransactionScope


class ClassifiableProductsForMatches(Protocol):
    """Lee los productos a clasificar a partir de ids de la cola.

    Vive como puerto propio y no como método suelto del repo de matches porque quien sabe armar un
    `ClassifiableProduct` (nombre + marca + tamaño + categoría de ORIGEN) es el lado de
    clasificación, no el de matching.
    """

    def classifiable_for_matches(
        self, match_ids: list[str]
    ) -> list[tuple[str, ClassifiableProduct]]:
        """`(match_id, producto)` de los matches pedidos. Omite los que ya no existen — el caller
        los reporta como fallidos en vez de inventarlos."""
        ...


class Classifier(Protocol):
    def execute(self, product: ClassifiableProduct, market_id: str):  # type: ignore[no-untyped-def]
        ...


@dataclass(frozen=True, slots=True)
class BulkClassifyRow:
    match_id: str
    taxonomy_node_id: str | None  # `None` = quedó sin decidir (el humano manda)
    method: str


@dataclass(frozen=True, slots=True)
class BulkClassifyFailure:
    match_id: str
    error: str


@dataclass(frozen=True, slots=True)
class BulkClassifyResult:
    rows: list[BulkClassifyRow] = field(default_factory=list)
    failed: list[BulkClassifyFailure] = field(default_factory=list)

    @property
    def classified(self) -> int:
        return sum(1 for r in self.rows if r.taxonomy_node_id is not None)

    @property
    def undecided(self) -> int:
        """Corrió y NO decidió — distinto de `failed`, que es "no se pudo ni intentar". La consola
        las dice por separado: la primera es trabajo para el humano, la segunda es un problema."""
        return sum(1 for r in self.rows if r.taxonomy_node_id is None)


class BulkClassifyReview:
    def __init__(
        self,
        *,
        scope: NestedTransactionScope,
        products: ClassifiableProductsForMatches,
        classifier: Classifier,
    ) -> None:
        self._scope = scope
        self._products = products
        self._classifier = classifier

    def execute(self, match_ids: list[str], *, market_id: str) -> BulkClassifyResult:
        loaded = dict(self._products.classifiable_for_matches(match_ids))
        rows: list[BulkClassifyRow] = []
        failed: list[BulkClassifyFailure] = []

        # Se itera sobre lo PEDIDO, no sobre lo cargado: así un match que ya no existe se reporta
        # en vez de desaparecer del resumen. Un lote que devuelve menos filas de las pedidas, sin
        # decir por qué, es exactamente el silencio que este módulo no se permite.
        for match_id in match_ids:
            product = loaded.get(match_id)
            if product is None:
                failed.append(BulkClassifyFailure(match_id, "el producto ya no existe"))
                continue
            try:
                # SAVEPOINT por fila: el rollback de UNA no deshace las ya confirmadas del lote.
                with self._scope.begin_nested():
                    result = self._classifier.execute(product, market_id)
            except Exception as exc:  # aislar el fallo de ESTA fila, nunca abortar el lote
                failed.append(BulkClassifyFailure(match_id, str(exc)))
            else:
                rows.append(BulkClassifyRow(match_id, result.taxonomy_node_id, result.method))

        return BulkClassifyResult(rows=rows, failed=failed)

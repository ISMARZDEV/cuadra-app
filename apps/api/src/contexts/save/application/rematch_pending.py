"""`RematchPending` — re-corre la cascada de matching sobre filas que YA están en la cola.

Existe porque los candidatos de la cola son ESTÁTICOS. `RefreshCatalogPrices` sólo enruta al matcher
los `store_product` DESCONOCIDOS (`exists(provider_id, external_id)`), así que una fila que cayó en
revisión cuando el catálogo era chico no se vuelve a evaluar nunca: arrastra para siempre los
candidatos del día que entró, aunque el canónico correcto exista desde hace semanas. Hasta ahora la
única salida era descartar —que además pierde el histórico de precios— o un script de CLI.

Idempotente por construcción, igual que el script: `record_match` hace upsert y `record_candidates`
REEMPLAZA el set (borra los previos antes de insertar), así que re-evaluar no duplica nada.

Espeja `BulkClassifyReview` en lo estructural (SAVEPOINT por fila, éxito parcial explícito) porque
es el mismo problema: un lote donde una fila falla no puede tumbar a las demás.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Protocol

from ..domain.ports.transaction import NestedTransactionScope
from ..domain.rematch import RematchableProduct
from .match_store_product import IncomingStoreProduct


class RematchableProductsForMatches(Protocol):
    """Lee, a partir de ids de la cola, lo que la cascada necesita para re-evaluar."""

    def rematchable_for_matches(
        self, match_ids: list[str]
    ) -> list[tuple[str, RematchableProduct]]:
        """`(match_id, producto)` de los matches pedidos. Omite los que ya no existen — el caller
        los reporta como fallidos en vez de inventarlos."""
        ...


class Matcher(Protocol):
    def execute(self, product: IncomingStoreProduct):  # type: ignore[no-untyped-def]
        ...


class CanonicalNames(Protocol):
    """Nombres de los canónicos a los que se enlazó, para poder AUDITAR el lote.

    Un id contra otro id es imposible de revisar: el operador tiene que poder leer «este producto de
    la cola quedó enlazado a este canónico» sin abrir cinco fichas.
    """

    def names_for(self, canonical_ids: list[str]) -> dict[str, str]: ...


def _to_incoming(product: RematchableProduct, market_id: str) -> IncomingStoreProduct:
    """Sin `run_id`: una re-evaluación NO es un hallazgo de una corrida de ingesta, y atribuírsela
    falsearía el embudo de esa corrida."""
    return IncomingStoreProduct(
        store_product_id=product.store_product_id,
        market_id=market_id,
        name=product.name,
        brand=product.brand,
        size=product.size,
        ean=product.ean,
        source_category=product.source_category,
    )


@dataclass(frozen=True, slots=True)
class RematchRow:
    match_id: str
    status: str
    method: str
    confidence: float
    # Ambos nombres viajan para que el lote se pueda AUDITAR de un vistazo.
    store_product_name: str = ""
    # `None` (y no "") cuando la fila siguió en la cola: no hay canónico al que se haya enlazado, y
    # un string vacío se renderiza como una celda en blanco indistinguible de un nombre que no se
    # pudo resolver.
    canonical_product_id: str | None = None
    canonical_name: str | None = None


@dataclass(frozen=True, slots=True)
class RematchFailure:
    match_id: str
    error: str


@dataclass(frozen=True, slots=True)
class RematchResult:
    rows: list[RematchRow] = field(default_factory=list)
    failed: list[RematchFailure] = field(default_factory=list)

    @property
    def auto_linked(self) -> int:
        return sum(1 for r in self.rows if r.status == "auto_linked")

    @property
    def still_pending(self) -> int:
        """Se re-evaluó y SIGUE en la cola. No es un fallo: es el resultado normal cuando el
        catálogo todavía no tiene el canónico correcto. Fundirlo con `failed` haría que un lote
        que enlazó 12 de 46 se leyera como terminado."""
        return sum(1 for r in self.rows if r.status != "auto_linked")


class RematchPending:
    def __init__(
        self,
        *,
        scope: NestedTransactionScope,
        products: RematchableProductsForMatches,
        matcher: Matcher,
        canonicals: CanonicalNames | None = None,
    ) -> None:
        self._scope = scope
        self._products = products
        self._matcher = matcher
        self._canonicals = canonicals

    def execute(self, match_ids: list[str], *, market_id: str) -> RematchResult:
        loaded = dict(self._products.rematchable_for_matches(match_ids))
        rows: list[RematchRow] = []
        failed: list[RematchFailure] = []

        # Se itera sobre lo PEDIDO, no sobre lo cargado: un match que ya no existe se reporta en
        # vez de desaparecer del resumen.
        for match_id in match_ids:
            product = loaded.get(match_id)
            if product is None:
                failed.append(RematchFailure(match_id, "el producto ya no existe"))
                continue
            try:
                # SAVEPOINT por fila: el rollback de UNA no deshace las ya confirmadas del lote.
                with self._scope.begin_nested():
                    result = self._matcher.execute(_to_incoming(product, market_id))
            except Exception as exc:  # aislar el fallo de ESTA fila, nunca abortar el lote
                failed.append(RematchFailure(match_id, str(exc)))
            else:
                rows.append(
                    RematchRow(
                        match_id,
                        result.status,
                        result.method,
                        result.confidence,
                        store_product_name=product.name,
                        canonical_product_id=getattr(result, "canonical_product_id", None),
                    )
                )

        return RematchResult(rows=self._with_canonical_names(rows), failed=failed)

    def _with_canonical_names(self, rows: list[RematchRow]) -> list[RematchRow]:
        """UNA consulta para todo el lote: resolver el nombre fila por fila serían 46 viajes."""
        ids = sorted({r.canonical_product_id for r in rows if r.canonical_product_id})
        if not ids or self._canonicals is None:
            return rows
        names = self._canonicals.names_for(ids)
        return [
            replace(r, canonical_name=names.get(r.canonical_product_id))
            if r.canonical_product_id
            else r
            for r in rows
        ]

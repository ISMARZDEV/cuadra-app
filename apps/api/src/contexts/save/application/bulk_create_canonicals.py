"""`BulkCreateCanonicals` — convierte en canónicos las filas seleccionadas de la cola.

Es la acción que la cola en arranque en frío necesita de verdad. Medido sobre la cola real: las 48
filas tienen CERO candidatos, así que "aprobar" (enlazar a un canónico existente) no puede resolver
ninguna — no hay a qué enlazar. Lo único que destraba el catálogo es CREAR.

Todo lo que un canónico necesita se DERIVA del propio store_product:

  - nombre y marca      → tal cual vienen de la tienda
  - cantidad            → `parse_size` del DOMINIO (48/48 de la cola parsean), que además convierte
                          a la unidad base; el front nunca hace esa conversión
  - categoría           → la única que no se puede derivar

Por eso el diálogo pregunta UNA sola cosa y solo para las filas que no la tienen. La regla es
estricta: el fallback LLENA HUECOS, nunca pisa una categoría ya decidida. Y sin categoría ni
fallback la fila se OMITE — un canónico sin categoría no puede existir, e inventarle una hoja sería
justo lo que la regla sagrada del módulo prohíbe.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from ..domain.classification import ClassifiableProduct
from ..domain.ports.transaction import NestedTransactionScope
from ..domain.value_objects import parse_size
from .create_canonical_and_link import NewCanonicalProduct


class ProductsWithCategory(Protocol):
    """Los productos del lote + la categoría `active` de cada uno."""

    def classifiable_for_matches(
        self, match_ids: list[str]
    ) -> list[tuple[str, ClassifiableProduct]]: ...

    def active_for(self, ref_id: str, *, is_canonical: bool): ...  # type: ignore[no-untyped-def]


class CanonicalCreator(Protocol):
    def execute(self, *, match_id: str, product: NewCanonicalProduct, decided_by: str) -> str: ...


@dataclass(frozen=True, slots=True)
class SkippedRow:
    """Corrió y NO se creó, por falta de categoría. Distinto de `failed`: acá no hubo error, hubo
    un dato que nadie decidió todavía."""

    match_id: str
    product_name: str


@dataclass(frozen=True, slots=True)
class FailedRow:
    match_id: str
    error: str


@dataclass(frozen=True, slots=True)
class BulkCreateResult:
    canonical_ids: list[str] = field(default_factory=list)
    skipped: list[SkippedRow] = field(default_factory=list)
    failed: list[FailedRow] = field(default_factory=list)

    @property
    def created(self) -> int:
        return len(self.canonical_ids)


class BulkCreateCanonicals:
    def __init__(
        self,
        *,
        scope: NestedTransactionScope,
        products: ProductsWithCategory,
        creator: CanonicalCreator,
        market_id: str,
    ) -> None:
        self._scope = scope
        self._products = products
        self._creator = creator
        self._market_id = market_id

    def execute(
        self,
        match_ids: list[str],
        *,
        fallback_taxonomy_node_id: str | None,
        decided_by: str,
        overrides: dict[str, str] | None = None,
    ) -> BulkCreateResult:
        """`overrides` = categoría elegida EXPLÍCITAMENTE para una fila concreta.

        Precedencia: **override > la que ya tiene > fallback**. El override gana incluso sobre una
        categoría existente porque es un acto deliberado sobre ESA fila: si el operador abre el
        selector de un producto ya clasificado y elige otra cosa, lo está corrigiendo. El fallback,
        en cambio, sigue siendo un relleno masivo y nunca pisa nada.
        """
        loaded = dict(self._products.classifiable_for_matches(match_ids))
        chosen = overrides or {}
        canonical_ids: list[str] = []
        skipped: list[SkippedRow] = []
        failed: list[FailedRow] = []

        # Se itera sobre lo PEDIDO: un match que ya no existe se reporta en vez de desaparecer del
        # resumen. Un lote que devuelve menos de lo pedido sin decir por qué es el silencio que este
        # módulo no se permite.
        for match_id in match_ids:
            product = loaded.get(match_id)
            if product is None:
                failed.append(FailedRow(match_id, "el producto ya no existe"))
                continue

            # override > propia > fallback. La categoría propia manda sobre el fallback (llenar
            # huecos nunca es pisar decisiones), pero un override las gana a las dos: es una
            # elección deliberada del operador sobre esta fila en particular.
            override = chosen.get(match_id)
            if override:
                leaf_id: str | None = override
            else:
                existing = self._products.active_for(product.ref_id, is_canonical=False)
                leaf_id = existing.taxonomy_node_id if existing else fallback_taxonomy_node_id
            if not leaf_id:
                skipped.append(SkippedRow(match_id, product.name))
                continue

            try:
                # SAVEPOINT por fila: el rollback de UNA no deshace las ya confirmadas del lote.
                with self._scope.begin_nested():
                    # `parse_size` vive en el DOMINIO y levanta `ValueError` ante una unidad que no
                    # conoce. Se deja propagar hacia el `except` de la fila: inventar una cantidad
                    # sería peor que reportar que ese producto no se pudo convertir.
                    quantity = parse_size(product.size_text)
                    canonical_ids.append(
                        self._creator.execute(
                            match_id=match_id,
                            product=NewCanonicalProduct(
                                name=product.name,
                                brand=product.brand,
                                quantity=quantity,
                                taxonomy_node_id=leaf_id,
                                market_id=self._market_id,
                                display_size=product.size_text or None,
                            ),
                            decided_by=decided_by,
                        )
                    )
            except Exception as exc:  # aislar el fallo de ESTA fila, nunca abortar el lote
                failed.append(FailedRow(match_id, str(exc)))

        return BulkCreateResult(canonical_ids=canonical_ids, skipped=skipped, failed=failed)

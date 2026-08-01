"""DiscardStoreProduct — borrado DURO de un `store_product` matcheado, desde el detalle canónico.

Decisión del usuario (2026-07-29), acción #1 del menú por proveedor: "eliminar de manera permanente
sin que me genere inconvenientes en un futuro para poder volver a ingerirlo si hace falta".

POR QUÉ ES RE-INGERIBLE. `RefreshPrices` decide qué hacer con cada entrada del catálogo con
`exists(provider_id, external_id)` (`refresh_prices.py:118`): desconocido → materializa y le corre
la cascada; conocido → solo refresca el precio. La identidad de un `store_product` es ese par, y no
hay denylist ni tombstone en la ingesta. Borrar la fila LIBERA la identidad: la próxima corrida lo
vuelve a ingerir y a matchear desde cero.

QUÉ SE DESTRUYE, y por qué no se puede evitar. `price.store_product_id` es `ON DELETE CASCADE`, así
que el histórico de precios de esa tienda para ese producto se va con la fila — irreversible. Se
informa ANTES (el diálogo de confirmación muestra `deleted_price_count`) y se deja registrado
DESPUÉS (la fila de auditoría guarda provider_id + external_id + el conteo, lo único que permite
reconstruir qué se destruyó). Igual suerte corren `store_product_image` y
`category_classification` (CASCADE); `canonical_product_image.source_store_product_id` es SET NULL,
así que la foto del canónico sobrevive y solo pierde la referencia a su origen.

ORDEN DE BORRADO, no es incidental: `product_match.store_product_id` es `ON DELETE NO ACTION`, o
sea que el DELETE del `store_product` FALLA si su match sigue ahí. Primero el match, después la
fila. Ambas escrituras comparten la Session/UoW del request (mismo invariante de
`ResolveReview`/`_auto_link`): si la segunda falla, la primera se revierte con ella.

Contraste deliberado con `ArchiveCanonicalProduct` (soft-delete, `archived_at`): archivar un
CANÓNICO no puede ser destructivo porque rompería comparaciones ya publicadas. Descartar el
producto de UNA tienda sí, porque es exactamente lo que se pidió y la ingesta lo puede reponer.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..domain.ports import StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository


@dataclass(frozen=True, slots=True)
class DiscardedStoreProduct:
    """Lo que el borrado se llevó. Alimenta la fila de auditoría y la confirmación de la UI."""

    provider_id: str
    external_id: str
    deleted_price_count: int


class DiscardStoreProduct:
    def __init__(
        self, *, match_repo: ProductMatchRepository, store_repo: StoreProductRepository
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo

    def execute(self, *, store_product_id: str, decided_by: str) -> DiscardedStoreProduct:
        # El locator se lee ANTES de borrar: después de la cascada ya no habría de dónde sacarlo, y
        # sin él la auditoría de un borrado irreversible no diría qué producto era.
        locator = self._store_repo.get_locator(store_product_id)
        if locator is None:
            raise ValueError(f"store_product no encontrado: {store_product_id!r}")
        price_count = self._store_repo.count_prices(store_product_id)

        # Orden obligatorio: el FK del match es NO ACTION y bloquearía el DELETE de abajo.
        self._match_repo.delete_by_store_product(store_product_id)
        self._store_repo.delete(store_product_id)

        return DiscardedStoreProduct(
            provider_id=locator.provider_id,
            external_id=locator.external_id,
            deleted_price_count=price_count,
        )

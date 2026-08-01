"""Use case CreateCanonicalAndLink (F2 · B1, tareas 1.15-1.16): el revisor decide que NINGÚN
candidato ofrecido (`review_candidate`) es el producto correcto, así que crea un `canonical_product`
nuevo y enlaza el `product_match` pendiente a él, en un solo flujo.

NO reimplementa el invariante de misma-transacción (FK denormalizado + `product_match` en la
MISMA Session/UoW) — compone con `ResolveReview` (F2·B1), que es el único dueño de esa frontera
transaccional. Este use case solo agrega el paso previo: `CanonicalProductRepository.add(...)`
(slug autogen, ver `SqlCanonicalProductRepository._unique_slug`).

El canónico HEREDA la galería del proveedor del que nació. La tienda ya publicó sus fotos y la
ingesta las guarda todas en `store_product_image` desde la migración `6c5a4babce47`; hacer que el
operador las re-agregara a mano una por una desde el detalle era trabajo inventado sobre un dato
que estaba a un SELECT de distancia. La herencia ocurre SÓLO al crear: enlazar un proveedor a un
canónico que ya existe no aporta fotos, porque un canónico con cinco tiendas acumularía treinta
imágenes que nadie decidió.

Este es el único punto donde se crea un canónico desde la cola, así que los tres caminos —el botón
individual del detalle, `BulkCreateCanonicals` y `PromoteStoreProductToCanonical`— heredan igual.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from ..domain.entities import CanonicalProduct
from ..domain.ports import CanonicalImageRepository, CanonicalProductRepository, StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository
from ..domain.value_objects import Quantity
from .resolve_review import ResolveReview

MAX_INHERITED_IMAGES = 10
"""Tope de fotos heredadas de una tienda.

Un proveedor puede publicar decenas (ángulos, empaque, tabla nutricional). Diez alcanzan de sobra
para una galería útil y evitan que un solo proveedor inunde la galería curada del canónico,
dejándole al operador el trabajo de podar que este cambio venía a eliminar.
"""


@dataclass(frozen=True, slots=True)
class NewCanonicalProduct:
    """Datos de entrada para el canónico nuevo — sin `id`/`slug` (los asigna la infra al persistir)."""

    name: str
    brand: str
    quantity: Quantity
    taxonomy_node_id: str
    market_id: str
    quality: str | None = None
    display_size: str | None = None
    image_url: str | None = None


class CreateCanonicalAndLink:
    def __init__(
        self,
        *,
        canonical_repo: CanonicalProductRepository,
        resolver: ResolveReview,
        match_repo: ProductMatchRepository | None = None,
        store_repo: StoreProductRepository | None = None,
        image_repo: CanonicalImageRepository | None = None,
    ) -> None:
        self._canonical_repo = canonical_repo
        self._resolver = resolver
        # Solo para ATRIBUIR el canónico a la corrida que encoló el match (F4 #4.5). Opcional a
        # propósito: sin él la creación funciona igual, solo queda sin atribuir.
        self._match_repo = match_repo
        # Ídem para la herencia de la galería: sin estos dos el canónico nace sin fotos, pero nace.
        # Ninguna foto vale bloquear la resolución de una fila de la cola.
        self._store_repo = store_repo
        self._image_repo = image_repo

    def _inherited_images(self, store_product_id: str) -> list[str]:
        """Fotos que la tienda publicó para ese producto, en SU orden (`position`).

        Se deduplica preservando el orden porque `add_image` rechaza una URL repetida, y hay
        adapters que emiten la misma foto en dos posiciones. Como la galería del canónico está
        vacía (acaba de nacer) y esta lista ya viene sin repetidos, la inserción de más abajo no
        puede chocar: no hace falta atrapar `DuplicateImageError`.
        """
        if self._store_repo is None or self._image_repo is None:
            return []

        urls = self._store_repo.list_store_images(store_product_id)
        if not urls:
            # `store_product` observados ANTES de que los adapters capturaran el array completo
            # sólo tienen la principal denormalizada. Perderla sería un retroceso.
            attrs = self._store_repo.get_raw_attrs(store_product_id)
            urls = [attrs.image_url] if attrs is not None and attrs.image_url else []

        deduped = list(dict.fromkeys(urls))
        return deduped[:MAX_INHERITED_IMAGES]

    def execute(self, *, match_id: str, product: NewCanonicalProduct, decided_by: str) -> str:
        canonical_id = str(uuid.uuid4())
        # Una sola lectura del match: de acá salen TANTO la atribución de corrida (F4 #4.5) como
        # el `store_product` cuya galería se hereda. Nunca revienta si el match no existe — el
        # dueño de fallar en ese caso es `ResolveReview`, más abajo.
        match = self._match_repo.get_by_id(match_id) if self._match_repo is not None else None
        image_urls = self._inherited_images(match.store_product_id) if match is not None else []

        self._canonical_repo.add(
            CanonicalProduct(
                canonical_id,
                product.name,
                product.brand,
                product.quantity,
                product.taxonomy_node_id,
                product.market_id,
                quality=product.quality,
                display_size=product.display_size,
                # La principal de la tienda desde el minuto cero: el canónico nunca existe, ni un
                # instante, sin la foto que el sitio público va a leer.
                image_url=image_urls[0] if image_urls else product.image_url,
                origin_run_id=match.run_id if match is not None else None,
            )
        )
        # Mismo invariante de misma-transacción que `_auto_link`/`ResolveReview`: si esta escritura
        # (FK denormalizado + product_match) fallara, el `add` de arriba comparte la misma Session
        # y se revierte junto con ella — no hay commit intermedio.
        self._resolver.execute(
            match_id=match_id, canonical_product_id=canonical_id, decided_by=decided_by
        )
        # Después del resolver, y en la MISMA transacción: si algo de arriba se revierte, no queda
        # una galería huérfana. `add_image` reespeja `canonical_product.image_url` en cada
        # inserción, así que el invariante de la posición 1 se mantiene solo.
        if self._image_repo is not None and match is not None:
            for url in image_urls:
                self._image_repo.add_image(
                    canonical_id, url=url, source_store_product_id=match.store_product_id
                )
        return canonical_id

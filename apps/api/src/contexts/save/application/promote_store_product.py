"""PromoteStoreProductToCanonical — crea un canónico NUEVO a partir de un `store_product` ya
matcheado y lo mueve ahí.

Acción #4 del menú por proveedor del detalle canónico: "al igual como hacemos desde Cola de
revisión, en base a ese producto mover ese canónico del producto en el que está y crear un producto
canónico con su categoría".

LO ÚNICO QUE PIDE AL CLIENTE ES LA CATEGORÍA. Nombre, marca y cantidad se DERIVAN en el servidor de
los atributos crudos del propio `store_product` (`get_raw_attrs`), incluida la conversión a unidad
base vía `parse_size` del DOMINIO — exactamente el mismo criterio que `BulkCreateCanonicals`.

Por qué importa y no es una comodidad: `parse_size` convierte "500 g" → `Quantity(0.5, MASS)`, y esa
es una REGLA DE DOMINIO. Si el navegador mandara `quantity_amount`/`quantity_measure`, tendría que
conocer la conversión, y dos implementaciones de la misma regla (una en TS, otra en Python) se
separan en cuanto aparece una unidad rara. El cliente manda lo que un HUMANO decide (la categoría);
todo lo derivable lo deriva quien es dueño de la regla.

`parse_size` levanta `ValueError` ante una unidad que no conoce y se deja PROPAGAR: inventar una
cantidad sería peor que decirle al operador que ese producto no se pudo convertir.

NO reimplementa el invariante transaccional: compone con `CreateCanonicalAndLink` (que a su vez
compone con `ResolveReview`, único dueño de la frontera). Cadena: este use case deriva y traduce la
clave → `CreateCanonicalAndLink` crea y atribuye la corrida → `ResolveReview` escribe FK + match.

El canónico VIEJO no se toca: puede seguir teniendo otras tiendas enlazadas, y archivarlo es una
decisión aparte (`ArchiveCanonicalProduct`).
"""
from __future__ import annotations

from ..domain.ports import (
    CanonicalImageRepository,
    CanonicalProductRepository,
    StoreProductRepository,
)
from ..domain.ports.repositories import ProductMatchRepository
from ..domain.value_objects import parse_size
from .create_canonical_and_link import CreateCanonicalAndLink, NewCanonicalProduct
from .resolve_review import ResolveReview


class PromoteStoreProductToCanonical:
    def __init__(
        self,
        *,
        match_repo: ProductMatchRepository,
        store_repo: StoreProductRepository,
        canonical_repo: CanonicalProductRepository,
        market_id: str,
        image_repo: CanonicalImageRepository | None = None,
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo
        self._market_id = market_id
        self._creator = CreateCanonicalAndLink(
            canonical_repo=canonical_repo,
            resolver=ResolveReview(match_repo=match_repo, store_repo=store_repo),
            match_repo=match_repo,
            # El canónico nuevo hereda la galería de ESTA tienda, igual que desde la cola de
            # revisión: promover y crear-desde-la-cola son el mismo acto por dos puertas.
            store_repo=store_repo,
            image_repo=image_repo,
        )

    def execute(
        self, *, store_product_id: str, taxonomy_node_id: str, decided_by: str
    ) -> str:
        match_id = self._match_repo.get_match_id_by_store_product(store_product_id)
        if match_id is None:
            raise ValueError(f"product_match no encontrado para store_product {store_product_id!r}")

        raw = self._store_repo.get_raw_attrs(store_product_id)
        if raw is None:
            raise ValueError(f"store_product no encontrado: {store_product_id!r}")
        # `name` es lo único NO derivable: `CanonicalProduct` lo exige no vacío y no hay de dónde
        # inventarlo. Se falla con un mensaje que dice qué falta, en vez de dejar que reviente el
        # dataclass con un error que el operador no puede accionar. `brand` sí tolera vacío.
        if not (raw.name and raw.name.strip()):
            raise ValueError(
                f"el store_product {store_product_id!r} no tiene nombre: no se puede crear un "
                "canónico sin nombre"
            )

        return self._creator.execute(
            match_id=match_id,
            product=NewCanonicalProduct(
                name=raw.name,
                brand=raw.brand or "",
                quantity=parse_size(raw.size_text),
                taxonomy_node_id=taxonomy_node_id,
                market_id=self._market_id,
                display_size=raw.size_text or None,
                image_url=raw.image_url,
            ),
            decided_by=decided_by,
        )

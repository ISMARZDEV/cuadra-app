"""RelinkStoreProduct — mueve un `store_product` de un canónico a OTRO ya existente.

Acción #3 del menú por proveedor del detalle canónico: "matchearlo con otro producto de la lista de
canónicos que esté disponible".

NO reimplementa nada. `ResolveReview` (F2·B1) ya es el dueño de la frontera transaccional del enlace
(FK denormalizado + `product_match` en la misma Session/UoW) y ya marca `method="human"` para que la
decisión humana sobrescriba el veredicto de la cascada. Lo único que agrega este use case es
traducir la clave que tiene la PANTALLA (`store_product_id`) a la que necesita `ResolveReview`
(`match_id`) — la fila es UNIQUE por store_product, así que la traducción es total y sin ambigüedad.

Por eso no valida que el canónico destino exista: si no existe, el `link_to_canonical` de
`ResolveReview` viola el FK, la excepción propaga y el `product_match` NUNCA se toca. Comprobarlo
antes sería una carrera (podría borrarse entre el chequeo y la escritura) y una segunda fuente de
verdad sobre una regla que la base ya garantiza.
"""
from __future__ import annotations

from ..domain.ports import StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository
from .resolve_review import ResolveReview


class RelinkStoreProduct:
    def __init__(
        self, *, match_repo: ProductMatchRepository, store_repo: StoreProductRepository
    ) -> None:
        self._match_repo = match_repo
        self._resolver = ResolveReview(match_repo=match_repo, store_repo=store_repo)

    def execute(
        self, *, store_product_id: str, canonical_product_id: str, decided_by: str
    ) -> None:
        match_id = self._match_repo.get_match_id_by_store_product(store_product_id)
        if match_id is None:
            raise ValueError(f"product_match no encontrado para store_product {store_product_id!r}")
        self._resolver.execute(
            match_id=match_id,
            canonical_product_id=canonical_product_id,
            decided_by=decided_by,
        )

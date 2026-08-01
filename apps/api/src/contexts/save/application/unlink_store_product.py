"""UnlinkStoreProduct — devuelve un `store_product` mal matcheado a la cola de revisión.

Acción #2 del menú por proveedor del detalle canónico: "devolver a la cola de revisión y sacarlo de
ese matcheo equivocado". Es la inversa de aprobar en la cola, y la alternativa NO destructiva a
`DiscardStoreProduct`: la fila y su histórico de precios quedan intactos, solo se deshace el enlace.

Deja el `product_match` en `pending_review` con `canonical_product_id=None`, que es exactamente el
estado en el que la cascada encola un match dudoso — así vuelve a aparecer en la Cola de revisión
sin ningún caso especial: la cola lista por status, no por procedencia.

POR QUÉ TAMBIÉN SE LIMPIA EL FK. `store_product.canonical_product_id` es el denormalizado que lee el
sitio público. Dejarlo apuntando al canónico equivocado mientras el match espera revisión seguiría
mostrando el producto mal comparado — el bug de F2.0 que `ResolveReview` cerró, pero al revés. Las
dos escrituras van en la misma Session/UoW: este use case es el dueño de la frontera transaccional.

EXIGE MOTIVO (regla sagrada #4 aplicada al camino humano, igual que rechazar en la cola): desenlazar
sin `reason_code` no es una decisión trazable. Se valida ANTES de tocar cualquier repo, así que un
intento sin motivo no deja escritura parcial.

OJO — la cascada NO lo va a re-matchear sola. `RefreshPrices` solo corre el matcher para
`store_product`s DESCONOCIDOS (`exists(provider_id, external_id)`), y este sigue existiendo. Vuelve
a la cola para que lo resuelva una PERSONA; si lo que se quiere es que la máquina lo reintente desde
cero, la acción correcta es `DiscardStoreProduct` (borra y libera la identidad).
"""
from __future__ import annotations

from ..domain.ports import StoreProductRepository
from ..domain.ports.repositories import ProductMatchRepository


class UnlinkStoreProduct:
    def __init__(
        self, *, match_repo: ProductMatchRepository, store_repo: StoreProductRepository
    ) -> None:
        self._match_repo = match_repo
        self._store_repo = store_repo

    def execute(
        self,
        *,
        store_product_id: str,
        decided_by: str,
        reason_code: str | None = None,
        reason_note: str | None = None,
    ) -> None:
        if not (reason_code and reason_code.strip()):
            raise ValueError(
                "reason_code es requerido al devolver un match a la cola "
                "(product_match.status='pending_review')"
            )

        # `ProductMatch` (dataclass PURO) no lleva `id`: la fila es UNIQUE por store_product, así que
        # la clave natural para llegar a ella desde esta pantalla es el propio store_product_id.
        match_id = self._match_repo.get_match_id_by_store_product(store_product_id)
        if match_id is None:
            raise ValueError(f"product_match no encontrado para store_product {store_product_id!r}")

        self._store_repo.unlink_from_canonical(store_product_id)
        # NO reusa `resolve_review`: ese método fuerza `status` a `auto_linked`/`rejected` según haya
        # canónico o no, y ninguno de los dos es "vuelve a la cola". Reabrir es un tercer desenlace.
        self._match_repo.reopen_review(
            match_id,
            decided_by,
            reason_code=reason_code,
            reason_note=reason_note,
        )

"""Casos de uso de los GRUPOS de productos: las carpetas que el usuario arma desde el detalle.

⭐ **Todo se filtra por `user_id` y esa es LA defensa, no una capa de más.** El id de un grupo es un
UUID que viaja en la URL; sin ese filtro, conocer un id ajeno bastaría para leer o escribir en la
carpeta de otro. Por eso el «no es tuyo» y el «no existe» devuelven el MISMO error: distinguirlos
convertiría el endpoint en un oráculo que confirma grupos ajenos a quien pruebe ids.
"""
from __future__ import annotations

from ..domain.groups import MAX_GROUPS_PER_USER, group_key, normalize_group_name
from ..domain.ports import CanonicalProductRepository, ProductGroupRepository
from .dtos import ProductGroupDto
from .errors import (
    CanonicalProductNotFoundError,
    DuplicateGroupNameError,
    ProductGroupNotFoundError,
    TooManyGroupsError,
)


class ListProductGroups:
    """Los grupos del usuario y, si se pregunta por un producto, en cuáles está.

    ⭐ La pertenencia se resuelve en UNA consulta aparte y no metiéndola en el listado: son dos
    preguntas distintas —«qué grupos tengo» y «dónde está esto»— y la primera la hace también la
    pantalla de grupos, que no tiene producto del que preguntar.
    """

    def __init__(self, groups: ProductGroupRepository) -> None:
        self._groups = groups

    def execute(self, user_id: str, product_id: str | None = None) -> list[ProductGroupDto]:
        contiene = (
            self._groups.group_ids_with_product(user_id, product_id)
            if product_id is not None
            else set()
        )
        return [
            ProductGroupDto(
                id=g.id,
                name=g.name,
                product_count=g.product_count,
                contains=g.id in contiene,
                created_at=g.created_at,
            )
            for g in self._groups.list_by_user(user_id)
        ]


class CreateProductGroup:
    """Crea un grupo y, si viene un producto, lo mete en el MISMO gesto.

    ⭐ Lo de meter el producto aquí no es un atajo: en la hoja, «crear grupo» se toca teniendo un
    producto delante. Partirlo en dos llamadas abre una ventana en la que el grupo existe vacío, y
    si la segunda falla el usuario se queda con una carpeta que nunca pidió.
    """

    def __init__(
        self, groups: ProductGroupRepository, canonical: CanonicalProductRepository
    ) -> None:
        self._groups = groups
        self._canonical = canonical

    def execute(
        self, user_id: str, name: str, market_id: str, product_id: str | None = None
    ) -> ProductGroupDto:
        limpio = normalize_group_name(name)

        # El producto se comprueba ANTES de crear nada: si no existe, no debe quedar un grupo huérfano.
        if product_id is not None and self._canonical.get_by_id(product_id) is None:
            raise CanonicalProductNotFoundError(product_id)

        existentes = self._groups.list_by_user(user_id)
        if len(existentes) >= MAX_GROUPS_PER_USER:
            raise TooManyGroupsError(MAX_GROUPS_PER_USER)

        # La unicidad se comprueba por LLAVE, no por el nombre crudo: dejar pasar «Fiesta» y
        # «fiesta» le deja al usuario dos filas idénticas en la hoja y ninguna forma de distinguirlas.
        # Va aquí, en quien ESCRIBE, y no en un índice de expresión — la doctrina del repo (§4b).
        llave = group_key(limpio)
        if any(group_key(g.name) == llave for g in existentes):
            raise DuplicateGroupNameError(limpio)

        group_id = self._groups.create(user_id, limpio, market_id)
        if product_id is not None:
            self._groups.add_product(user_id, group_id, product_id)

        creado = next(g for g in self._groups.list_by_user(user_id) if g.id == group_id)
        return ProductGroupDto(
            id=creado.id,
            name=creado.name,
            product_count=creado.product_count,
            contains=product_id is not None,
            created_at=creado.created_at,
        )


class AddProductToGroup:
    """Mete un producto en un grupo. IDEMPOTENTE: dos toques seguidos describen el mismo mundo."""

    def __init__(
        self, groups: ProductGroupRepository, canonical: CanonicalProductRepository
    ) -> None:
        self._groups = groups
        self._canonical = canonical

    def execute(self, user_id: str, group_id: str, product_id: str) -> None:
        if self._canonical.get_by_id(product_id) is None:
            raise CanonicalProductNotFoundError(product_id)
        if not self._groups.add_product(user_id, group_id, product_id):
            raise ProductGroupNotFoundError(group_id)


class RemoveProductFromGroup:
    """Lo saca. Quitar lo que no estaba NO es un error: el resultado es el que se pidió."""

    def __init__(self, groups: ProductGroupRepository) -> None:
        self._groups = groups

    def execute(self, user_id: str, group_id: str, product_id: str) -> None:
        if not self._groups.remove_product(user_id, group_id, product_id):
            raise ProductGroupNotFoundError(group_id)


class DeleteProductGroup:
    """Borra el grupo entero. Su contenido se va con él (la pertenencia no vive sin el grupo)."""

    def __init__(self, groups: ProductGroupRepository) -> None:
        self._groups = groups

    def execute(self, user_id: str, group_id: str) -> None:
        if not self._groups.delete(user_id, group_id):
            raise ProductGroupNotFoundError(group_id)

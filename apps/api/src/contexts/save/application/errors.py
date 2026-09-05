"""Errores de la capa de aplicación de Save → se mapean a HTTP en el controller."""
from __future__ import annotations


class SaveError(Exception):
    """Base de errores de aplicación de Save."""


class CanonicalProductNotFoundError(SaveError):
    def __init__(self, product_id: str) -> None:
        super().__init__(f"Producto canónico no encontrado: {product_id}")
        self.product_id = product_id


class CategoryNotFoundError(SaveError):
    def __init__(self, slug: str) -> None:
        super().__init__(f"Categoría no encontrada: {slug}")
        self.slug = slug


class ProductGroupNotFoundError(SaveError):
    """El grupo no existe **o no es de quien pregunta**.

    ⚠️ Los dos casos dan el MISMO error a propósito: distinguirlos convertiría el endpoint en un
    oráculo que confirma la existencia de grupos ajenos a quien pruebe ids (IDOR de enumeración).
    """

    def __init__(self, group_id: str) -> None:
        super().__init__(f"Grupo no encontrado: {group_id}")
        self.group_id = group_id


class DuplicateGroupNameError(SaveError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Ya tienes un grupo llamado «{name}»")
        self.name = name


class TooManyGroupsError(SaveError):
    def __init__(self, limit: int) -> None:
        super().__init__(f"No puedes tener más de {limit} grupos")
        self.limit = limit

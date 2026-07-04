"""Errores de la capa de aplicación de Save → se mapean a HTTP en el controller."""
from __future__ import annotations


class SaveError(Exception):
    """Base de errores de aplicación de Save."""


class CanonicalProductNotFoundError(SaveError):
    def __init__(self, product_id: str) -> None:
        super().__init__(f"Producto canónico no encontrado: {product_id}")
        self.product_id = product_id

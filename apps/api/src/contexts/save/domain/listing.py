"""Read model del listado por categoría (Imagen #5). PURO (ADR 31).

`OfferingRow` = una fila producto×tienda (grain crudo que entrega el repo). El use case las
agrega en memoria: precio mínimo por producto, conteo de tiendas, precio/unidad (money-math del
dominio) y las facetas. Mantener el grain crudo deja la money-math fuera del SQL (§12·B).
"""
from __future__ import annotations

from dataclasses import dataclass

from src.shared.money import Money

from .value_objects import Quantity


@dataclass(frozen=True, slots=True)
class OfferingRow:
    product_id: str
    name: str
    brand: str
    quality: str | None
    quantity: Quantity
    provider_id: str
    provider_name: str
    price: Money

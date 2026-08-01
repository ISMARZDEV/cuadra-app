"""Identidad de un `store_product` frente a la INGESTA — PURO (ADR 31).

`(provider_id, external_id)` es lo que `RefreshPrices` consulta con `exists(...)` para decidir si
una entrada del catálogo es nueva (→ materializar + cascada de matching) o ya conocida (→ solo
refrescar el precio). No es la PK de la fila: es su identidad EXTERNA, la que sobrevive a un borrado
y permite que la próxima corrida vuelva a ingerir el mismo producto.

Existe como tipo propio porque el borrado duro (`DiscardStoreProduct`) tiene que leerla ANTES de
destruir la fila: es el único dato que después permite auditar qué se borró y saber qué va a
reaparecer en la siguiente corrida.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StoreProductLocator:
    provider_id: str
    external_id: str

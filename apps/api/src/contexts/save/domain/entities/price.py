"""`Price` — registro histórico de precio, PURO (ADR 31). Append-only (el foso, §6.2).

Cada observación de precio se guarda con su `captured_at`, `price_type` (online/delivery/
góndola/recibo — NUNCA se mezclan en una comparación) y `source`. Nunca se hace UPDATE: la
serie temporal acumulada es el activo incopiable. Money en minor units (§12·B).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from src.shared.money import Money


class PriceType(StrEnum):
    ONLINE = "online"      # catálogo e-commerce (API de la tienda)
    DELIVERY = "delivery"  # agregador (PedidosYa/UberEats) — más inflado
    SHELF = "shelf"        # góndola física
    RECEIPT = "receipt"    # recibo del usuario (OCR/e-CF) — el más veraz


@dataclass(frozen=True, slots=True)
class Price:
    store_product_id: str
    value: Money
    captured_at: datetime
    price_type: PriceType
    source: str

    def __post_init__(self) -> None:
        if self.value.amount_minor <= 0:
            raise ValueError("Price.value debe ser > 0")

"""Read model del histórico de precios (C9). PURO (ADR 31).

`PricePoint` = un PUNTO DE CAMBIO de la tabla `price` (change-only, doc 10) con el nombre de
la tienda ya resuelto (join en infra). El chart 1M/3M/Todos se arma con estos puntos; el
`price_type` viaja para no mezclar online/delivery/góndola (regla del doc 01).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from src.shared.money import Money

from .entities import PriceType


@dataclass(frozen=True, slots=True)
class PricePoint:
    provider_id: str
    provider_name: str
    price: Money
    captured_at: datetime
    price_type: PriceType

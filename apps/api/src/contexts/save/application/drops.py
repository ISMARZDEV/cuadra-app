"""Use case ListPriceDrops (G4): bajadas de precio recientes de un mercado.

Fase "sin usuarios" de las alertas: detección pura sobre la tabla `price` (change-only).
La infra entrega los pares consecutivos; `detect_drops` (dominio) clasifica y ordena.
Sobre este feed se montan A7 "mejores ofertas" y las alertas por usuario (F2: suscripción
+ notificación). El precio nunca se calcula aquí: viene de la BD en enteros.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..domain.drops import detect_drops
from ..domain.ports import StoreProductRepository
from .dtos import PriceDropDto


class ListPriceDrops:
    def __init__(self, store_repo: StoreProductRepository) -> None:
        self._store_repo = store_repo

    def execute(
        self, market_id: str, days: int = 7, now: datetime | None = None
    ) -> list[PriceDropDto]:
        since = (now or datetime.now(timezone.utc)) - timedelta(days=days)
        changes = self._store_repo.list_price_changes(market_id, since)
        return [PriceDropDto.from_drop(d) for d in detect_drops(changes)]

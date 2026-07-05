"""Use case GetPriceHistory (C9): series de precio por supermercado para el chart 1M/3M/Todos.

La tabla `price` es change-only (doc 10): puntos de CAMBIO, no un punto por día. Por eso la
ventana incluye el BASELINE carry-in por tienda: el último cambio anterior al inicio de la
ventana (el precio vigente al arrancar el chart). El volumen por producto es chico (~12-24
cambios/año por tienda), así que la ventana se resuelve en memoria sobre el histórico completo.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from src.shared.money import primary_currency_for_market

from ..domain.history import PricePoint
from ..domain.ports import CanonicalProductRepository, StoreProductRepository
from .dtos import PriceHistoryDto
from .errors import CanonicalProductNotFoundError

HistoryRange = Literal["1m", "3m", "all"]

_RANGE_DAYS: dict[str, int] = {"1m": 30, "3m": 90}


def _window(points: list[PricePoint], since: datetime | None) -> list[PricePoint]:
    """Puntos dentro de la ventana + baseline carry-in (último cambio anterior a `since`)."""
    if since is None:
        return points
    baseline: PricePoint | None = None
    inside: list[PricePoint] = []
    for point in points:  # ya vienen ordenados por captured_at
        if point.captured_at < since:
            baseline = point
        else:
            inside.append(point)
    return ([baseline] if baseline else []) + inside


class GetPriceHistory:
    def __init__(
        self,
        canonical_repo: CanonicalProductRepository,
        store_repo: StoreProductRepository,
    ) -> None:
        self._canonical_repo = canonical_repo
        self._store_repo = store_repo

    def execute(
        self,
        canonical_product_id: str,
        range_: HistoryRange = "all",
        now: datetime | None = None,
    ) -> PriceHistoryDto:
        canonical = self._canonical_repo.get_by_id(canonical_product_id)
        if canonical is None:
            raise CanonicalProductNotFoundError(canonical_product_id)

        days = _RANGE_DAYS.get(range_)
        since = ((now or datetime.now(timezone.utc)) - timedelta(days=days)) if days else None

        by_provider: dict[str, list[PricePoint]] = {}
        for point in self._store_repo.list_price_history(canonical_product_id):
            by_provider.setdefault(point.provider_id, []).append(point)

        series = {pid: _window(pts, since) for pid, pts in by_provider.items()}
        fallback_currency = primary_currency_for_market(canonical.market_id)
        return PriceHistoryDto.from_series(canonical, range_, series, fallback_currency)

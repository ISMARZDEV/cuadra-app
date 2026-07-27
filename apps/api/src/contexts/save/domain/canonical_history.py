"""Histórico admin del canónico: rangos + KPIs (F5, US-CP-D6/D7). PURO (ADR 31).

La tabla `price` es change-only (doc 10): guarda PUNTOS DE CAMBIO, no un punto por día. De ahí
salen casi todas las sutilezas de este módulo:

1. **Baseline carry-in.** Una tienda que no cambió su precio dentro del rango no tiene ningún
   punto adentro. Sin arrastrar el último cambio ANTERIOR al rango, su línea arrancaría vacía —
   y "no hay datos" no es lo mismo que "el precio no se movió".
2. **El carry-in NO es un cambio del rango.** Contarlo en `price_change_count` inflaría el número
   y le haría creer al operador que hubo movimiento que no hubo.
3. **Sin datos es `None`, no `0`.** Cero pesos es un PRECIO válido; devolver 0 donde no hay
   histórico sería exactamente la mentira-en-verde que este módulo tiene prohibida.

Todo el dinero viaja en MINOR UNITS y como `int`. Nunca floats (regla sagrada de Save).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from .history import PricePoint


class CanonicalHistoryRange(StrEnum):
    """Rangos del detalle admin. El histórico PÚBLICO sólo soporta 1m/3m/all; el SDD del detalle
    pide 15d/1m/3m/6m/1y — se declara acá sin tocar el contrato público."""

    FIFTEEN_DAYS = "15d"
    ONE_MONTH = "1m"
    THREE_MONTHS = "3m"
    SIX_MONTHS = "6m"
    ONE_YEAR = "1y"
    ALL = "all"


RANGE_DAYS: dict[CanonicalHistoryRange, int] = {
    CanonicalHistoryRange.FIFTEEN_DAYS: 15,
    CanonicalHistoryRange.ONE_MONTH: 30,
    CanonicalHistoryRange.THREE_MONTHS: 90,
    CanonicalHistoryRange.SIX_MONTHS: 180,
    CanonicalHistoryRange.ONE_YEAR: 365,
}


def range_since(range_: CanonicalHistoryRange, *, now: datetime) -> datetime | None:
    """Inicio del rango. `None` para `all` — sin cota inferior."""
    days = RANGE_DAYS.get(range_)
    return now - timedelta(days=days) if days else None


def window_with_carry_in(
    points: list[PricePoint], *, since: datetime | None
) -> list[PricePoint]:
    """Puntos dentro del rango, precedidos del ÚLTIMO cambio anterior (el precio vigente al
    arrancar). Espeja el comportamiento del histórico público para que el chart admin y el
    público no cuenten historias distintas sobre los mismos datos.
    """
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


@dataclass(frozen=True, slots=True)
class CanonicalPriceKpis:
    """KPIs del histórico (US-CP-D6). Determinísticos: se calculan sobre los puntos, nunca por IA.

    Los `None` son un estado legítimo — significan "no hay histórico suficiente", no cero.
    """

    min_price_minor: int | None = None
    max_price_minor: int | None = None
    spread_minor: int | None = None
    active_provider_count: int = 0
    last_updated_at: datetime | None = None
    change_in_range_minor: int | None = None
    price_change_count: int = 0

    @property
    def has_data(self) -> bool:
        return self.min_price_minor is not None


def derive_price_kpis(
    series: dict[str, list[PricePoint]],
    *,
    now: datetime,
    since: datetime | None = None,
) -> CanonicalPriceKpis:
    """KPIs sobre las series YA acotadas al rango (con su carry-in si lo hay).

    `since` sólo se usa para saber qué puntos son cambios OCURRIDOS dentro del rango: los
    anteriores son el carry-in y no cuentan.
    """
    non_empty = {pid: pts for pid, pts in series.items() if pts}
    if not non_empty:
        return CanonicalPriceKpis()

    # Precio ACTUAL de cada tienda = su punto más reciente.
    current = [pts[-1].price.amount_minor for pts in non_empty.values()]
    minimum, maximum = min(current), max(current)

    # Precio de cada tienda al ARRANCAR el rango = su primer punto (carry-in si existía).
    starting = [pts[0].price.amount_minor for pts in non_empty.values()]

    changes = sum(
        1
        for pts in non_empty.values()
        for point in pts
        if since is None or point.captured_at >= since
    )

    return CanonicalPriceKpis(
        min_price_minor=minimum,
        max_price_minor=maximum,
        spread_minor=maximum - minimum,
        active_provider_count=len(non_empty),
        last_updated_at=max(pts[-1].captured_at for pts in non_empty.values()),
        # Variación del MEJOR precio disponible: es la pregunta que el operador se hace.
        change_in_range_minor=minimum - min(starting),
        price_change_count=changes,
    )

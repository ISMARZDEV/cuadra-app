"""`Budget` — presupuesto por categoría o comercio (§5.2 + gap aprobado), PURO.

Dado lo gastado, calcula el % consumido (ENTERO, sin float — coherente con §12·B), qué
umbrales se cruzaron (70/85/100) y el estado que pinta el anillo y dispara las alertas.
`category_account_id` = la cuenta `expense` a la que aplica; `merchant_id` opcional limita
el budget a un comercio ("$3,000 en Starbucks").
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from src.shared.money import Money


class BudgetPeriod(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class BudgetStatus(StrEnum):
    ON_TRACK = "on_track"
    WARNING = "warning"
    OVER = "over"


@dataclass(frozen=True, slots=True)
class BudgetConsumption:
    percent: int
    thresholds_crossed: tuple[int, ...]
    status: BudgetStatus
    remaining: Money


@dataclass(frozen=True, slots=True)
class Budget:
    id: str
    user_id: str
    category_account_id: str
    limit: Money
    period: BudgetPeriod
    merchant_id: str | None = None
    alert_thresholds: tuple[int, ...] = (70, 85, 100)

    def __post_init__(self) -> None:
        if self.limit.amount_minor <= 0:
            raise ValueError(f"El límite del presupuesto debe ser > 0, fue {self.limit.amount_minor}")
        object.__setattr__(self, "alert_thresholds", tuple(sorted(set(self.alert_thresholds))))

    def consumption(self, spent: Money) -> BudgetConsumption:
        remaining = self.limit - spent  # CurrencyMismatch si distinta moneda
        percent = spent.amount_minor * 100 // self.limit.amount_minor
        crossed = tuple(t for t in self.alert_thresholds if percent >= t)
        if percent >= 100:
            status = BudgetStatus.OVER
        elif crossed:
            status = BudgetStatus.WARNING
        else:
            status = BudgetStatus.ON_TRACK
        return BudgetConsumption(percent, crossed, status, remaining)

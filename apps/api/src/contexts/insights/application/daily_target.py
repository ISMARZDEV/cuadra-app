"""Use case de LECTURA: "Daily Target" / "You spent today" (card ③). CQRS-read.

Cuánto puedes gastar por día sin pasarte del presupuesto del mes:
`(Σ límites de budgets mensuales − gastado en el mes hasta hoy) / días que quedan`,
nunca negativo. Las cifras son enteros agregados en SQL (§7.3, §12·B), no las toca un LLM.
"""
from __future__ import annotations

import calendar
from datetime import date

from src.contexts.insights.domain.ledger import AccountType
from src.contexts.insights.domain.ports import (
    BudgetRepository,
    InsightsMetricsRepository,
)

from .dtos import DailyTarget, DailyTargetByCurrency


class GetDailyTarget:
    def __init__(
        self, metrics: InsightsMetricsRepository, budgets: BudgetRepository
    ) -> None:
        self._metrics = metrics
        self._budgets = budgets

    def execute(self, user_id: str, as_of: date) -> DailyTarget:
        month_start = as_of.replace(day=1)
        last_day = calendar.monthrange(as_of.year, as_of.month)[1]
        month_end = as_of.replace(day=last_day)
        days_remaining = (month_end - as_of).days + 1  # incluye hoy → ≥ 1 (sin /0)

        limits = self._budgets.monthly_limit_by_currency(user_id)
        spent_month = self._metrics.flow_by_currency(
            user_id, AccountType.EXPENSE, month_start, as_of
        )
        spent_today = self._metrics.flow_by_currency(
            user_id, AccountType.EXPENSE, as_of, as_of
        )

        currencies = sorted(set(limits) | set(spent_month) | set(spent_today))
        blocks: list[DailyTargetByCurrency] = []
        for cur in currencies:
            limit = limits.get(cur, 0)
            spent_m = spent_month.get(cur, 0)
            remaining = limit - spent_m
            blocks.append(
                DailyTargetByCurrency(
                    currency=cur,
                    monthly_limit_minor=limit,
                    spent_month_minor=spent_m,
                    remaining_minor=remaining,
                    days_remaining=days_remaining,
                    daily_target_minor=max(0, remaining) // days_remaining,
                    spent_today_minor=spent_today.get(cur, 0),
                )
            )
        return DailyTarget(by_currency=blocks)

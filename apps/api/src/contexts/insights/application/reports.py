"""Use cases de LECTURA de la pantalla de reportes (🥧). CQRS-read.

Gasto por categoría (donut) e ingresos-vs-gastos por mes. Las cifras se agregan en SQL
(§7.3); aquí solo se voltea el signo de income (saldo natural −; ver insights-ledger.md §2)
y se ordena/empaqueta a DTO. Nada de floats (§12·B).
"""
from __future__ import annotations

from datetime import date

from src.contexts.insights.domain.ledger import AccountType
from src.contexts.insights.domain.ports import ReportsRepository

from .dtos import (
    ByCategoryReport,
    CategorySpend,
    IncomeVsExpenseReport,
    MonthlyFlow,
)


class GetSpendByCategory:
    def __init__(self, reports: ReportsRepository) -> None:
        self._reports = reports

    def execute(
        self, user_id: str, kind: AccountType, since: date, until: date
    ) -> ByCategoryReport:
        rows = self._reports.spend_by_category(user_id, kind, since, until)
        sign = -1 if kind is AccountType.INCOME else 1  # income tiene saldo natural −
        items = [
            CategorySpend(
                category_account_id=acc_id,
                name=name,
                icon=icon,
                currency=currency,
                total_minor=sign * raw,
            )
            for acc_id, name, icon, currency, raw in rows
        ]
        items.sort(key=lambda c: c.total_minor, reverse=True)
        return ByCategoryReport(kind=kind.value, by_category=items)


class GetIncomeVsExpense:
    def __init__(self, reports: ReportsRepository) -> None:
        self._reports = reports

    def execute(self, user_id: str, since: date, until: date) -> IncomeVsExpenseReport:
        income = self._reports.monthly_flow(user_id, AccountType.INCOME, since, until)
        expense = self._reports.monthly_flow(user_id, AccountType.EXPENSE, since, until)
        keys = sorted(set(income) | set(expense))
        blocks = [
            MonthlyFlow(
                month=month,
                currency=currency,
                income_minor=-income.get((month, currency), 0),  # voltear income
                expense_minor=expense.get((month, currency), 0),
            )
            for month, currency in keys
        ]
        return IncomeVsExpenseReport(by_month=blocks)

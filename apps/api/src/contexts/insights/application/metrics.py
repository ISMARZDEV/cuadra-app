"""Use case de LECTURA: métricas de Insights (§5.3) derivadas del ledger. CQRS-read.

Las cifras NO las calcula un LLM (principio Cleo §7.3): son agregaciones SQL sobre los
postings. Por moneda (el frontend tiene toggle DOP/USD). Convención de signos: income y
liability tienen saldo natural NEGATIVO → se voltea para mostrar (ver insights-ledger.md §2).

`savings` = Σ saldo de las wallets ligadas a metas de ahorro (savings_goal.account_id),
por moneda. `daily_target` vive aparte (read model propio): ver `daily_target.py`.
"""
from __future__ import annotations

from datetime import date

from src.contexts.insights.domain.ledger import AccountType
from src.contexts.insights.domain.ports import InsightsMetricsRepository

from .dtos import CurrencyMetrics, InsightsMetrics


class GetInsightsMetrics:
    def __init__(self, metrics: InsightsMetricsRepository) -> None:
        self._metrics = metrics

    def execute(self, user_id: str, since: date, until: date) -> InsightsMetrics:
        income = self._metrics.flow_by_currency(user_id, AccountType.INCOME, since, until)
        expenses = self._metrics.flow_by_currency(user_id, AccountType.EXPENSE, since, until)
        assets = self._metrics.balance_by_currency(user_id, AccountType.ASSET)
        liabilities = self._metrics.balance_by_currency(user_id, AccountType.LIABILITY)
        savings = self._metrics.savings_by_currency(user_id)  # Σ wallets ligadas a metas

        currencies = sorted(
            set(income) | set(expenses) | set(assets) | set(liabilities) | set(savings)
        )
        blocks: list[CurrencyMetrics] = []
        for cur in currencies:
            total_income = -income.get(cur, 0)        # income normal balance − → voltear
            total_expenses = expenses.get(cur, 0)
            total_balance = assets.get(cur, 0)        # Σ assets (wallets)
            net_worth = assets.get(cur, 0) + liabilities.get(cur, 0)  # liability ya viene con signo
            blocks.append(
                CurrencyMetrics(
                    currency=cur,
                    total_income_minor=total_income,
                    total_expenses_minor=total_expenses,
                    balance_minor=total_income - total_expenses,
                    total_balance_minor=total_balance,
                    net_worth_minor=net_worth,
                    savings_minor=savings.get(cur, 0),
                )
            )
        return InsightsMetrics(by_currency=blocks)

"""Unit — GetDailyTarget: la matemática de "cuánto puedo gastar hoy" con repos FALSOS.

Daily Target = (Σ límites de budgets mensuales − gastado en el mes hasta hoy) / días que
quedan del mes; nunca negativo (si te pasaste, 0). "You spent today" = Σ gastos de hoy.
Las cifras NO las toca un LLM: enteros (minor units) agregados (§7.3, §12·B).
"""
from __future__ import annotations

from datetime import date

from src.contexts.insights.application.daily_target import GetDailyTarget
from src.contexts.insights.domain.ledger import AccountType

USER = "u1"


class FakeMetrics:
    """Implementa InsightsMetricsRepository devolviendo flujos predefinidos por rango."""

    def __init__(self, flows: dict[tuple[date, date], dict[str, int]]) -> None:
        self._flows = flows

    def flow_by_currency(self, user_id, account_type, since, until):  # type: ignore[no-untyped-def]
        assert account_type is AccountType.EXPENSE
        return self._flows.get((since, until), {})

    def balance_by_currency(self, user_id, account_type):  # type: ignore[no-untyped-def]
        return {}

    def savings_by_currency(self, user_id):  # type: ignore[no-untyped-def]
        return {}


class FakeBudgets:
    def __init__(self, limits: dict[str, int]) -> None:
        self._limits = limits

    def monthly_limit_by_currency(self, user_id):  # type: ignore[no-untyped-def]
        return self._limits


def test_daily_target_divides_remaining_by_days_left() -> None:
    as_of = date(2026, 6, 10)  # quedan 21 días (10..30 inclusive)
    metrics = FakeMetrics(
        {
            (date(2026, 6, 1), as_of): {"DOP": 180_000},   # gastado en el mes
            (as_of, as_of): {"DOP": 50_000},               # gastado hoy
        }
    )
    budgets = FakeBudgets({"DOP": 600_000})  # presupuesto mensual RD$6,000

    result = GetDailyTarget(metrics, budgets).execute(USER, as_of)
    block = {b.currency: b for b in result.by_currency}["DOP"]

    assert block.monthly_limit_minor == 600_000
    assert block.spent_month_minor == 180_000
    assert block.remaining_minor == 420_000        # 600,000 − 180,000
    assert block.days_remaining == 21
    assert block.daily_target_minor == 20_000      # 420,000 // 21 = RD$200/día
    assert block.spent_today_minor == 50_000


def test_daily_target_is_zero_when_overspent() -> None:
    as_of = date(2026, 6, 10)
    metrics = FakeMetrics({(date(2026, 6, 1), as_of): {"DOP": 700_000}, (as_of, as_of): {}})
    budgets = FakeBudgets({"DOP": 600_000})

    block = {b.currency: b for b in GetDailyTarget(metrics, budgets).execute(USER, as_of).by_currency}["DOP"]

    assert block.remaining_minor == -100_000   # informativo: te pasaste
    assert block.daily_target_minor == 0       # nunca negativo


def test_daily_target_without_budget_still_reports_spent_today() -> None:
    as_of = date(2026, 6, 10)
    metrics = FakeMetrics({(as_of, as_of): {"DOP": 50_000}})
    budgets = FakeBudgets({})  # sin presupuestos

    block = {b.currency: b for b in GetDailyTarget(metrics, budgets).execute(USER, as_of).by_currency}["DOP"]

    assert block.monthly_limit_minor == 0
    assert block.daily_target_minor == 0
    assert block.spent_today_minor == 50_000


def test_daily_target_last_day_of_month_has_one_day_left() -> None:
    as_of = date(2026, 6, 30)  # último día → queda 1 día (no división por cero)
    metrics = FakeMetrics({(date(2026, 6, 1), as_of): {"DOP": 0}, (as_of, as_of): {}})
    budgets = FakeBudgets({"DOP": 600_000})

    block = {b.currency: b for b in GetDailyTarget(metrics, budgets).execute(USER, as_of).by_currency}["DOP"]

    assert block.days_remaining == 1
    assert block.daily_target_minor == 600_000  # todo el restante cabe en el último día

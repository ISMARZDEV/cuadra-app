"""Unit — RecurringRule (gap aprobado): recurrentes/suscripciones + bill reminders.

Botón 🔔 + filtro suscripciones (insights-ui-navbar.md). Una regla sabe si está VENCIDA,
cómo AVANZAR su próxima fecha (con clamp de fin de mes) y MATERIALIZAR una `Transaction`
para esa ocurrencia. Ver insights-ledger.md §6 (recurring_rule).
"""
from __future__ import annotations

from datetime import date, datetime

import pytest

from src.contexts.insights.domain.entities import (
    Cadence,
    RecurringRule,
    TransactionType,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _rule(cadence: Cadence, next_run: date, *, active: bool = True) -> RecurringRule:
    return RecurringRule(
        "r1", "u1", TransactionType.EXPENSE, Money(35_000, DOP),
        "acc-banco", "acc-subs", cadence, next_run, active=active,
    )


def test_requires_positive_amount() -> None:
    with pytest.raises(ValueError):
        RecurringRule(
            "r1", "u1", TransactionType.EXPENSE, Money(0, DOP),
            "a", "b", Cadence.MONTHLY, date(2026, 6, 1),
        )


def test_is_due() -> None:
    r = _rule(Cadence.MONTHLY, date(2026, 6, 1))
    assert r.is_due(date(2026, 6, 1)) is True
    assert r.is_due(date(2026, 5, 31)) is False
    assert _rule(Cadence.MONTHLY, date(2026, 6, 1), active=False).is_due(date(2026, 7, 1)) is False


def test_advance_daily_weekly() -> None:
    assert _rule(Cadence.DAILY, date(2026, 6, 1)).advance().next_run == date(2026, 6, 2)
    assert _rule(Cadence.WEEKLY, date(2026, 6, 1)).advance().next_run == date(2026, 6, 8)


def test_advance_monthly_clamps_end_of_month() -> None:
    # 31 ene → 28 feb (2026 no bisiesto)
    assert _rule(Cadence.MONTHLY, date(2026, 1, 31)).advance().next_run == date(2026, 2, 28)


def test_advance_yearly_clamps_leap_day() -> None:
    # 29 feb 2024 → 28 feb 2025
    assert _rule(Cadence.YEARLY, date(2024, 2, 29)).advance().next_run == date(2025, 2, 28)


def test_materialize_generates_recurring_transaction() -> None:
    r = _rule(Cadence.MONTHLY, date(2026, 6, 1))
    tx = r.materialize("tx-1", datetime(2026, 6, 1, 0, 5))
    assert tx.id == "tx-1"
    assert tx.type is TransactionType.EXPENSE
    assert tx.amount == Money(35_000, DOP)
    assert tx.recurring is True
    # el asiento generado cuadra (integración con el ledger)
    assert len(tx.to_journal_entry().postings) == 2

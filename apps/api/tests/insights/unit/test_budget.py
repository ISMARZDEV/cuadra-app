"""Unit — Budget (§5.2 + gap aprobado): límite por categoría/comercio + umbrales 70/85/100.

Comportamiento de dominio: dado lo gastado, calcular % consumido (entero, sin float),
qué umbrales se cruzaron y el estado (on_track/warning/over) que pinta el anillo y dispara
las alertas. Ver insights-ui-navbar.md (botón $) e insights-ledger.md §6.
"""
from __future__ import annotations

import pytest

from src.contexts.insights.domain.entities import Budget, BudgetPeriod, BudgetStatus
from src.shared.money import Currency, CurrencyMismatchError, Money

DOP = Currency("DOP")
USD = Currency("USD")


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


def test_budget_requires_positive_limit() -> None:
    with pytest.raises(ValueError):
        Budget("b1", "u1", "cat-food", _dop(0), BudgetPeriod.MONTHLY)


def test_consumption_on_track() -> None:
    b = Budget("b1", "u1", "cat-food", _dop(100_000), BudgetPeriod.MONTHLY)  # $1,000
    c = b.consumption(_dop(50_000))  # $500 = 50%
    assert c.percent == 50
    assert c.status is BudgetStatus.ON_TRACK
    assert c.thresholds_crossed == ()
    assert c.remaining == _dop(50_000)


def test_consumption_warning_when_threshold_crossed() -> None:
    b = Budget("b1", "u1", "cat-food", _dop(100_000), BudgetPeriod.MONTHLY)
    c = b.consumption(_dop(75_000))  # 75%
    assert c.percent == 75
    assert c.status is BudgetStatus.WARNING
    assert 70 in c.thresholds_crossed
    assert 85 not in c.thresholds_crossed


def test_consumption_over_budget() -> None:
    b = Budget("b1", "u1", "cat-food", _dop(100_000), BudgetPeriod.MONTHLY)
    c = b.consumption(_dop(120_000))  # 120%
    assert c.percent == 120
    assert c.status is BudgetStatus.OVER
    assert 100 in c.thresholds_crossed
    assert c.remaining == _dop(-20_000)


def test_budget_per_merchant_and_custom_thresholds() -> None:
    b = Budget(
        "b1", "u1", "cat-coffee", _dop(300_000), BudgetPeriod.MONTHLY,
        merchant_id="starbucks", alert_thresholds=(50, 80, 100),
    )
    assert b.merchant_id == "starbucks"
    c = b.consumption(_dop(150_000))  # 50%
    assert 50 in c.thresholds_crossed
    assert c.status is BudgetStatus.WARNING


def test_thresholds_are_normalized_sorted_unique() -> None:
    b = Budget(
        "b1", "u1", "c", _dop(100_000), BudgetPeriod.MONTHLY,
        alert_thresholds=(100, 70, 70, 85),
    )
    assert b.alert_thresholds == (70, 85, 100)


def test_consumption_mixing_currencies_raises() -> None:
    b = Budget("b1", "u1", "c", _dop(100_000), BudgetPeriod.MONTHLY)
    with pytest.raises(CurrencyMismatchError):
        b.consumption(Money(50_000, USD))

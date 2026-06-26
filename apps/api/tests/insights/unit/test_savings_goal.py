"""Unit — SavingsGoal (§5.2): meta de ahorro (alcancía) + progreso.

Alimenta la tarjeta "Savings" y el modal ☆ (insights-ui-navbar.md botón 7). El progreso
se calcula sobre lo ahorrado (entero, sin float); remaining nunca es negativo.
"""
from __future__ import annotations

import pytest

from src.contexts.insights.domain.entities import SavingsGoal
from src.shared.money import Currency, CurrencyMismatchError, Money

DOP = Currency("DOP")
USD = Currency("USD")


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


def test_goal_requires_positive_target() -> None:
    with pytest.raises(ValueError):
        SavingsGoal("g1", "u1", "Viaje", _dop(0))


def test_progress_partial() -> None:
    g = SavingsGoal("g1", "u1", "Viaje", _dop(1_000_000))  # $10,000
    p = g.progress(_dop(250_000))  # $2,500 = 25%
    assert p.percent == 25
    assert p.remaining == _dop(750_000)
    assert p.reached is False


def test_progress_reached_exactly() -> None:
    g = SavingsGoal("g1", "u1", "Viaje", _dop(1_000_000))
    p = g.progress(_dop(1_000_000))
    assert p.percent == 100
    assert p.remaining == _dop(0)
    assert p.reached is True


def test_progress_exceeded_floors_remaining_at_zero() -> None:
    g = SavingsGoal("g1", "u1", "Viaje", _dop(1_000_000))
    p = g.progress(_dop(1_200_000))  # 120% — sobre-ahorró
    assert p.percent == 120
    assert p.remaining == _dop(0)   # nunca negativo
    assert p.reached is True


def test_progress_mixing_currencies_raises() -> None:
    g = SavingsGoal("g1", "u1", "Viaje", _dop(1_000_000))
    with pytest.raises(CurrencyMismatchError):
        g.progress(Money(100, USD))

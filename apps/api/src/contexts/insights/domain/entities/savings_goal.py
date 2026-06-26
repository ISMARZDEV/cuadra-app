"""`SavingsGoal` — meta de ahorro (alcancía) + progreso (§5.2), PURO.

Alimenta la tarjeta "Savings" y el modal ☆. El progreso se calcula sobre lo ahorrado
(entero, sin float); `remaining` nunca es negativo (si sobre-ahorraste, queda en 0).
`account_id` opcional liga una wallet de ahorro cuyo balance ES el progreso.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.shared.money import CurrencyMismatchError, Money


@dataclass(frozen=True, slots=True)
class GoalProgress:
    percent: int
    remaining: Money
    reached: bool


@dataclass(frozen=True, slots=True)
class SavingsGoal:
    id: str
    user_id: str
    name: str
    target: Money
    account_id: str | None = None

    def __post_init__(self) -> None:
        if self.target.amount_minor <= 0:
            raise ValueError(f"El objetivo de ahorro debe ser > 0, fue {self.target.amount_minor}")

    def progress(self, saved: Money) -> GoalProgress:
        if saved.currency != self.target.currency:
            raise CurrencyMismatchError(self.target.currency, saved.currency)
        reached = saved.amount_minor >= self.target.amount_minor
        remaining_minor = max(0, self.target.amount_minor - saved.amount_minor)
        percent = saved.amount_minor * 100 // self.target.amount_minor
        return GoalProgress(percent, Money(remaining_minor, self.target.currency), reached)

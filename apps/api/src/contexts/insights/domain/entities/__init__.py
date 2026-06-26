"""Entidades de dominio de Insights (§5.2). API pública del paquete."""
from __future__ import annotations

from .budget import Budget, BudgetConsumption, BudgetPeriod, BudgetStatus
from .recurring_rule import Cadence, RecurringRule
from .savings_goal import GoalProgress, SavingsGoal
from .space import Space
from .transaction import (
    Merchant,
    Transaction,
    TransactionSource,
    TransactionType,
)

__all__ = [
    "Budget",
    "BudgetConsumption",
    "BudgetPeriod",
    "BudgetStatus",
    "Cadence",
    "GoalProgress",
    "Merchant",
    "RecurringRule",
    "SavingsGoal",
    "Space",
    "Transaction",
    "TransactionSource",
    "TransactionType",
]

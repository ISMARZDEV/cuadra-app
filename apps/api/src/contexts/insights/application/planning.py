"""Creators thin de planificación de Insights (§5.2 + gaps aprobados).

SetBudget / CreateSpace / CreateSavingsGoal / CreateRecurringRule: construyen su entidad
de dominio y la persisten. Su única regla de aplicación es RBAC §12.1: validar que las
cuentas referenciadas EXISTEN y son del MISMO usuario (no presupuestar/agrupar/ligar
cuentas ajenas). Las invariantes de cada entidad (límite > 0, etc.) las cuida el dominio.
La `Session` (UoW) hace commit/rollback fuera de aquí (composition_root).
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import date

from src.contexts.insights.domain.entities import (
    Budget,
    BudgetPeriod,
    Cadence,
    Merchant,
    RecurringRule,
    SavingsGoal,
    Space,
    TransactionType,
)
from src.contexts.insights.domain.ports import (
    AccountRepository,
    BudgetRepository,
    RecurringRuleRepository,
    SavingsGoalRepository,
    SpaceRepository,
)
from src.shared.ids import new_id
from src.shared.money import Money

from .errors import AccountNotFoundError, CrossUserAccountError

_DEFAULT_THRESHOLDS = (70, 85, 100)


def _ensure_owned(accounts: AccountRepository, user_id: str, *account_ids: str) -> None:
    """Cada cuenta referida existe y es del usuario (RBAC §12.1). None se ignora."""
    for account_id in account_ids:
        if account_id is None:
            continue
        account = accounts.get_by_id(account_id)
        if account is None:
            raise AccountNotFoundError(f"Cuenta inexistente: {account_id}")
        if account.user_id != user_id:
            raise CrossUserAccountError(f"La cuenta {account_id} pertenece a otro usuario")


class SetBudget:
    def __init__(
        self,
        accounts: AccountRepository,
        budgets: BudgetRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._budgets = budgets
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        category_account_id: str,
        limit: Money,
        period: BudgetPeriod,
        merchant_id: str | None = None,
        alert_thresholds: Iterable[int] = _DEFAULT_THRESHOLDS,
    ) -> Budget:
        _ensure_owned(self._accounts, user_id, category_account_id)
        budget = Budget(
            self._id(),
            user_id,
            category_account_id,
            limit,
            period,
            merchant_id,
            tuple(alert_thresholds),
        )
        self._budgets.add(budget)
        return budget


class CreateSpace:
    def __init__(
        self,
        accounts: AccountRepository,
        spaces: SpaceRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._spaces = spaces
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        name: str,
        account_ids: Iterable[str] = (),
    ) -> Space:
        ids = list(account_ids)
        _ensure_owned(self._accounts, user_id, *ids)
        space = Space(self._id(), user_id, name, frozenset(ids))
        self._spaces.add(space)
        return space


class CreateSavingsGoal:
    def __init__(
        self,
        accounts: AccountRepository,
        goals: SavingsGoalRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._goals = goals
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        name: str,
        target: Money,
        account_id: str | None = None,
    ) -> SavingsGoal:
        if account_id is not None:
            _ensure_owned(self._accounts, user_id, account_id)
        goal = SavingsGoal(self._id(), user_id, name, target, account_id)
        self._goals.add(goal)
        return goal


class CreateRecurringRule:
    def __init__(
        self,
        accounts: AccountRepository,
        rules: RecurringRuleRepository,
        id_factory: Callable[[], str] = new_id,
    ) -> None:
        self._accounts = accounts
        self._rules = rules
        self._id = id_factory

    def execute(
        self,
        *,
        user_id: str,
        type: TransactionType,
        amount: Money,
        account_id: str,
        counter_account_id: str,
        cadence: Cadence,
        next_run: date,
        active: bool = True,
        merchant: Merchant | None = None,
        note: str | None = None,
    ) -> RecurringRule:
        _ensure_owned(self._accounts, user_id, account_id, counter_account_id)
        rule = RecurringRule(
            self._id(),
            user_id,
            type,
            amount,
            account_id,
            counter_account_id,
            cadence,
            next_run,
            active,
            merchant,
            note,
        )
        self._rules.add(rule)
        return rule

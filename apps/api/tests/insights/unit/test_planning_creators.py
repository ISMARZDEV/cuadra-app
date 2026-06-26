"""Unit — creators thin de planificación con repos FALSOS (write path).

SetBudget / CreateSpace / CreateSavingsGoal / CreateRecurringRule construyen su entidad
y la persisten. Validan PERTENENCIA de las cuentas referenciadas (RBAC §12.1): no puedes
presupuestar/agrupar/ligar/reglar cuentas que no son tuyas, ni inexistentes.
"""
from __future__ import annotations

from datetime import date

import pytest

from src.contexts.insights.application.errors import (
    AccountNotFoundError,
    CrossUserAccountError,
)
from src.contexts.insights.application.planning import (
    CreateRecurringRule,
    CreateSavingsGoal,
    CreateSpace,
    SetBudget,
)
from src.contexts.insights.domain.entities import (
    BudgetPeriod,
    Cadence,
    TransactionType,
)
from src.contexts.insights.domain.ledger import Account, AccountType
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USER = "u1"
OTHER = "u2"


class FakeAccounts:
    def __init__(self) -> None:
        self._by_id: dict[str, Account] = {}

    def add(self, account: Account) -> None:
        self._by_id[account.id] = account

    def get_by_id(self, account_id: str) -> Account | None:
        return self._by_id.get(account_id)

    def list_by_user(self, user_id: str) -> list[Account]:
        return [a for a in self._by_id.values() if a.user_id == user_id]


class FakeRepo:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, entity: object) -> None:
        self.added.append(entity)


def _ids():  # type: ignore[no-untyped-def]
    seq = iter(f"id-{i}" for i in range(1, 100))
    return lambda: next(seq)


def _account(user_id: str, type_: AccountType, name: str) -> Account:
    seq = _account.counter = getattr(_account, "counter", 0) + 1  # type: ignore[attr-defined]
    return Account(f"acc-{seq}", user_id, type_, DOP, name)


# ── SetBudget ────────────────────────────────────────────────────────────────
def test_set_budget_persists_with_default_thresholds() -> None:
    accounts = FakeAccounts()
    fuel = _account(USER, AccountType.EXPENSE, "Combustible")
    accounts.add(fuel)
    budgets = FakeRepo()

    budget = SetBudget(accounts, budgets, id_factory=_ids()).execute(
        user_id=USER, category_account_id=fuel.id, limit=Money(300_000, DOP),
        period=BudgetPeriod.MONTHLY,
    )

    assert budget.alert_thresholds == (70, 85, 100)
    assert budget.limit == Money(300_000, DOP)
    assert budgets.added == [budget]


def test_set_budget_rejects_unknown_category() -> None:
    with pytest.raises(AccountNotFoundError):
        SetBudget(FakeAccounts(), FakeRepo(), id_factory=_ids()).execute(
            user_id=USER, category_account_id="missing", limit=Money(300_000, DOP),
            period=BudgetPeriod.MONTHLY,
        )


def test_set_budget_rejects_cross_user_category() -> None:
    accounts = FakeAccounts()
    fuel = _account(OTHER, AccountType.EXPENSE, "Combustible")  # de OTRO usuario
    accounts.add(fuel)
    with pytest.raises(CrossUserAccountError):
        SetBudget(accounts, FakeRepo(), id_factory=_ids()).execute(
            user_id=USER, category_account_id=fuel.id, limit=Money(300_000, DOP),
            period=BudgetPeriod.MONTHLY,
        )


# ── CreateSpace ──────────────────────────────────────────────────────────────
def test_create_space_with_owned_accounts() -> None:
    accounts = FakeAccounts()
    banco = _account(USER, AccountType.ASSET, "Banco")
    fuel = _account(USER, AccountType.EXPENSE, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)
    spaces = FakeRepo()

    space = CreateSpace(accounts, spaces, id_factory=_ids()).execute(
        user_id=USER, name="Hogar", account_ids=[banco.id, fuel.id],
    )

    assert space.name == "Hogar"
    assert space.contains(banco.id) and space.contains(fuel.id)
    assert spaces.added == [space]


def test_create_empty_space_is_allowed() -> None:
    space = CreateSpace(FakeAccounts(), FakeRepo(), id_factory=_ids()).execute(
        user_id=USER, name="Vacío", account_ids=[],
    )
    assert space.account_ids == frozenset()


def test_create_space_rejects_cross_user_account() -> None:
    accounts = FakeAccounts()
    ajeno = _account(OTHER, AccountType.ASSET, "Banco ajeno")
    accounts.add(ajeno)
    with pytest.raises(CrossUserAccountError):
        CreateSpace(accounts, FakeRepo(), id_factory=_ids()).execute(
            user_id=USER, name="Hogar", account_ids=[ajeno.id],
        )


# ── CreateSavingsGoal ────────────────────────────────────────────────────────
def test_create_savings_goal_without_account() -> None:
    goals = FakeRepo()
    goal = CreateSavingsGoal(FakeAccounts(), goals, id_factory=_ids()).execute(
        user_id=USER, name="Viaje", target=Money(10_000_000, DOP),
    )
    assert goal.target == Money(10_000_000, DOP)
    assert goal.account_id is None
    assert goals.added == [goal]


def test_create_savings_goal_with_owned_account() -> None:
    accounts = FakeAccounts()
    ahorro = _account(USER, AccountType.ASSET, "Ahorro")
    accounts.add(ahorro)
    goal = CreateSavingsGoal(accounts, FakeRepo(), id_factory=_ids()).execute(
        user_id=USER, name="Viaje", target=Money(10_000_000, DOP), account_id=ahorro.id,
    )
    assert goal.account_id == ahorro.id


def test_create_savings_goal_rejects_cross_user_account() -> None:
    accounts = FakeAccounts()
    ajeno = _account(OTHER, AccountType.ASSET, "Ahorro ajeno")
    accounts.add(ajeno)
    with pytest.raises(CrossUserAccountError):
        CreateSavingsGoal(accounts, FakeRepo(), id_factory=_ids()).execute(
            user_id=USER, name="Viaje", target=Money(10_000_000, DOP), account_id=ajeno.id,
        )


# ── CreateRecurringRule ──────────────────────────────────────────────────────
def test_create_recurring_rule_persists() -> None:
    accounts = FakeAccounts()
    banco = _account(USER, AccountType.ASSET, "Banco")
    subs = _account(USER, AccountType.EXPENSE, "Subscriptions")
    accounts.add(banco)
    accounts.add(subs)
    rules = FakeRepo()

    rule = CreateRecurringRule(accounts, rules, id_factory=_ids()).execute(
        user_id=USER, type=TransactionType.EXPENSE, amount=Money(35_000, DOP),
        account_id=banco.id, counter_account_id=subs.id, cadence=Cadence.MONTHLY,
        next_run=date(2026, 7, 1), note="Spotify",
    )

    assert rule.cadence is Cadence.MONTHLY
    assert rule.active is True
    assert rules.added == [rule]


def test_create_recurring_rule_rejects_cross_user_account() -> None:
    accounts = FakeAccounts()
    banco = _account(USER, AccountType.ASSET, "Banco")
    ajeno = _account(OTHER, AccountType.EXPENSE, "Subs ajeno")
    accounts.add(banco)
    accounts.add(ajeno)
    with pytest.raises(CrossUserAccountError):
        CreateRecurringRule(accounts, FakeRepo(), id_factory=_ids()).execute(
            user_id=USER, type=TransactionType.EXPENSE, amount=Money(35_000, DOP),
            account_id=banco.id, counter_account_id=ajeno.id, cadence=Cadence.MONTHLY,
            next_run=date(2026, 7, 1),
        )

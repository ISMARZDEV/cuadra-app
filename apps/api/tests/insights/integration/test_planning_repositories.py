"""Integration — repos de Budget/Space/SavingsGoal/RecurringRule contra la DB real.

Round-trips que prueban la persistencia normalizada: umbrales en tabla aparte (budget),
membresía M:N (space), merchant normalizado (recurring_rule).
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

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
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.planning import (
    SqlBudgetRepository,
    SqlRecurringRuleRepository,
    SqlSavingsGoalRepository,
    SqlSpaceRepository,
)
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USER = str(uuid.uuid4())


def _acc(type_: AccountType, name: str) -> Account:
    return Account(str(uuid.uuid4()), USER, type_, DOP, name)


def test_budget_roundtrip_with_thresholds(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    fuel = _acc(AccountType.EXPENSE, "Combustible")
    accounts.add(fuel)
    repo = SqlBudgetRepository(db_session)

    budget = Budget(
        str(uuid.uuid4()), USER, fuel.id, Money(300_000, DOP), BudgetPeriod.MONTHLY,
        alert_thresholds=(70, 85, 100),
    )
    repo.add(budget)
    got = repo.get_by_id(budget.id)

    assert got is not None
    assert got.limit == Money(300_000, DOP)
    assert got.alert_thresholds == (70, 85, 100)
    assert got.category_account_id == fuel.id


def test_space_roundtrip_and_membership_sync(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    banco = _acc(AccountType.ASSET, "Banco")
    fuel = _acc(AccountType.EXPENSE, "Combustible")
    accounts.add(banco)
    accounts.add(fuel)
    repo = SqlSpaceRepository(db_session)

    space = Space(str(uuid.uuid4()), USER, "Hogar").with_account(banco.id).with_account(fuel.id)
    repo.add(space)
    got = repo.get_by_id(space.id)
    assert got is not None
    assert got.account_ids == frozenset({banco.id, fuel.id})

    # quitar un miembro y re-sincronizar
    repo.save_members(got.without_account(fuel.id))
    after = repo.get_by_id(space.id)
    assert after is not None
    assert after.account_ids == frozenset({banco.id})


def test_savings_goal_roundtrip(db_session: Session) -> None:
    repo = SqlSavingsGoalRepository(db_session)
    goal = SavingsGoal(str(uuid.uuid4()), USER, "Viaje", Money(1_000_000, DOP))
    repo.add(goal)
    got = repo.get_by_id(goal.id)
    assert got is not None
    assert got.name == "Viaje"
    assert got.target == Money(1_000_000, DOP)


def test_recurring_rule_roundtrip_with_merchant(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    banco = _acc(AccountType.ASSET, "Banco")
    subs = _acc(AccountType.EXPENSE, "Subscriptions")
    accounts.add(banco)
    accounts.add(subs)
    repo = SqlRecurringRuleRepository(db_session)

    rule = RecurringRule(
        str(uuid.uuid4()), USER, TransactionType.EXPENSE, Money(35_000, DOP),
        banco.id, subs.id, Cadence.MONTHLY, date(2026, 7, 1),
        merchant=Merchant("Spotify", "https://logo/spotify.png"),
    )
    repo.add(rule)
    got = repo.get_by_id(rule.id)
    assert got is not None
    assert got.cadence is Cadence.MONTHLY
    assert got.merchant is not None and got.merchant.name == "Spotify"

    due = repo.list_due(USER, date(2026, 7, 1))
    assert any(r.id == rule.id for r in due)

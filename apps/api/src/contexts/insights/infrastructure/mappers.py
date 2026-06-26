"""Mappers model ↔ entity de Insights — EXPLÍCITOS (idiom hexagonal).

El dominio no conoce el ORM; aquí se traduce en un solo lugar. El `Merchant` (value object)
se reconstruye desde la fila normalizada de `merchant` (se pasa por separado).
"""
from __future__ import annotations

from collections.abc import Iterable

from src.contexts.insights.domain.entities import (
    Budget,
    BudgetPeriod,
    Cadence,
    Merchant,
    RecurringRule,
    SavingsGoal,
    Space,
    Transaction,
    TransactionSource,
    TransactionType,
)
from src.contexts.insights.domain.ledger import Account, AccountType
from src.shared.money import Currency, Money

from .models import (
    AccountModel,
    BudgetModel,
    MerchantModel,
    RecurringRuleModel,
    SavingsGoalModel,
    SpaceModel,
    TransactionModel,
)


def account_to_entity(model: AccountModel) -> Account:
    return Account(
        id=str(model.id),
        user_id=str(model.user_id),
        type=AccountType(model.type),
        currency=Currency(model.currency),
        name=model.name,
        icon=model.icon,
    )


def transaction_to_entity(
    model: TransactionModel, merchant: MerchantModel | None = None
) -> Transaction:
    merchant_vo = Merchant(merchant.name, merchant.logo_url) if merchant else None
    return Transaction(
        id=str(model.id),
        user_id=str(model.user_id),
        type=TransactionType(model.type),
        amount=Money(model.amount_minor, Currency(model.currency)),
        account_id=str(model.account_id),
        counter_account_id=str(model.counter_account_id),
        occurred_at=model.occurred_at,
        source=TransactionSource(model.source),
        idempotency_key=model.idempotency_key,
        merchant=merchant_vo,
        note=model.note,
        essential=model.essential,
        recurring=model.recurring,
    )


def budget_to_entity(model: BudgetModel, thresholds: Iterable[int]) -> Budget:
    return Budget(
        id=str(model.id),
        user_id=str(model.user_id),
        category_account_id=str(model.category_account_id),
        limit=Money(model.limit_minor, Currency(model.currency)),
        period=BudgetPeriod(model.period),
        merchant_id=str(model.merchant_id) if model.merchant_id else None,
        alert_thresholds=tuple(thresholds),
    )


def space_to_entity(model: SpaceModel, account_ids: Iterable[str]) -> Space:
    return Space(
        id=str(model.id),
        user_id=str(model.user_id),
        name=model.name,
        account_ids=frozenset(account_ids),
    )


def savings_goal_to_entity(model: SavingsGoalModel) -> SavingsGoal:
    return SavingsGoal(
        id=str(model.id),
        user_id=str(model.user_id),
        name=model.name,
        target=Money(model.target_minor, Currency(model.currency)),
        account_id=str(model.account_id) if model.account_id else None,
    )


def recurring_rule_to_entity(
    model: RecurringRuleModel, merchant: MerchantModel | None = None
) -> RecurringRule:
    merchant_vo = Merchant(merchant.name, merchant.logo_url) if merchant else None
    return RecurringRule(
        id=str(model.id),
        user_id=str(model.user_id),
        type=TransactionType(model.type),
        amount=Money(model.amount_minor, Currency(model.currency)),
        account_id=str(model.account_id),
        counter_account_id=str(model.counter_account_id),
        cadence=Cadence(model.cadence),
        next_run=model.next_run,
        active=model.active,
        merchant=merchant_vo,
        note=model.note,
    )

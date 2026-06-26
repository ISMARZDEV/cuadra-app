"""Composition root — DI: cablea puertos → adaptadores y arma los use cases (ADR 24).

Único lugar que conoce las implementaciones concretas. Los controllers reciben los
use cases ya cableados vía `Depends`. La `Session` (`get_session`) es el Unit of Work
(commit al éxito, rollback al error) y se inyecta por request.
"""
from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends
from sqlalchemy.orm import Session

from src.contexts.identity.application.queries import GetMe
from src.contexts.identity.infrastructure.repositories import (
    SqlCapabilityGatingRepository,
    SqlUserRepository,
)
from src.contexts.insights.application.daily_target import GetDailyTarget
from src.contexts.insights.application.metrics import GetInsightsMetrics
from src.contexts.insights.application.planning import (
    CreateRecurringRule,
    CreateSavingsGoal,
    CreateSpace,
    SetBudget,
)
from src.contexts.insights.application.queries import (
    ListAccounts,
    ListBudgets,
    ListRecentTransactions,
    ListRecurringRules,
    ListSavingsGoals,
    ListSpaces,
)
from src.contexts.insights.application.reports import (
    GetIncomeVsExpense,
    GetSpendByCategory,
)
from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.planning import (
    SqlBudgetRepository,
    SqlRecurringRuleRepository,
    SqlSavingsGoalRepository,
    SqlSpaceRepository,
)
from src.contexts.insights.infrastructure.reports import SqlReportsRepository
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.shared.db.base import SessionLocal


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_get_me(session: Session = Depends(get_session)) -> GetMe:
    return GetMe(SqlUserRepository(session), SqlCapabilityGatingRepository(session))


def get_record_transaction(
    session: Session = Depends(get_session),
) -> RecordTransaction:
    return RecordTransaction(
        SqlAccountRepository(session),
        SqlTransactionRepository(session),
        SqlLedgerRepository(session),
    )


def get_get_insights_metrics(
    session: Session = Depends(get_session),
) -> GetInsightsMetrics:
    return GetInsightsMetrics(SqlInsightsMetricsRepository(session))


def get_get_daily_target(session: Session = Depends(get_session)) -> GetDailyTarget:
    return GetDailyTarget(
        SqlInsightsMetricsRepository(session), SqlBudgetRepository(session)
    )


def get_set_budget(session: Session = Depends(get_session)) -> SetBudget:
    return SetBudget(SqlAccountRepository(session), SqlBudgetRepository(session))


def get_create_space(session: Session = Depends(get_session)) -> CreateSpace:
    return CreateSpace(SqlAccountRepository(session), SqlSpaceRepository(session))


def get_create_savings_goal(
    session: Session = Depends(get_session),
) -> CreateSavingsGoal:
    return CreateSavingsGoal(
        SqlAccountRepository(session), SqlSavingsGoalRepository(session)
    )


def get_create_recurring_rule(
    session: Session = Depends(get_session),
) -> CreateRecurringRule:
    return CreateRecurringRule(
        SqlAccountRepository(session), SqlRecurringRuleRepository(session)
    )


# ── Read models (queries) ────────────────────────────────────────────────────
def get_list_accounts(session: Session = Depends(get_session)) -> ListAccounts:
    return ListAccounts(
        SqlAccountRepository(session), SqlInsightsMetricsRepository(session)
    )


def get_list_recent_transactions(
    session: Session = Depends(get_session),
) -> ListRecentTransactions:
    return ListRecentTransactions(SqlTransactionRepository(session))


def get_list_spaces(session: Session = Depends(get_session)) -> ListSpaces:
    return ListSpaces(SqlSpaceRepository(session))


def get_list_budgets(session: Session = Depends(get_session)) -> ListBudgets:
    return ListBudgets(SqlBudgetRepository(session))


def get_list_savings_goals(
    session: Session = Depends(get_session),
) -> ListSavingsGoals:
    return ListSavingsGoals(SqlSavingsGoalRepository(session))


def get_list_recurring_rules(
    session: Session = Depends(get_session),
) -> ListRecurringRules:
    return ListRecurringRules(SqlRecurringRuleRepository(session))


def get_get_spend_by_category(
    session: Session = Depends(get_session),
) -> GetSpendByCategory:
    return GetSpendByCategory(SqlReportsRepository(session))


def get_get_income_vs_expense(
    session: Session = Depends(get_session),
) -> GetIncomeVsExpense:
    return GetIncomeVsExpense(SqlReportsRepository(session))

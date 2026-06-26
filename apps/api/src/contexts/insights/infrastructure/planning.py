"""Repos SQLAlchemy de las entidades de planificación de Insights (infra · ADR 31):
Budget, Space, SavingsGoal, RecurringRule. La `Session` es el UoW.
"""
from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from src.contexts.insights.domain.entities import (
    Budget,
    BudgetPeriod,
    RecurringRule,
    SavingsGoal,
    Space,
)

from .mappers import (
    budget_to_entity,
    recurring_rule_to_entity,
    savings_goal_to_entity,
    space_to_entity,
)
from .merchant import get_or_create_merchant
from .models import (
    BudgetAlertThresholdModel,
    BudgetModel,
    MerchantModel,
    RecurringRuleModel,
    SavingsGoalModel,
    SpaceAccountModel,
    SpaceModel,
)


class SqlBudgetRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, budget: Budget) -> None:
        self._session.add(
            BudgetModel(
                id=uuid.UUID(budget.id),
                user_id=uuid.UUID(budget.user_id),
                category_account_id=uuid.UUID(budget.category_account_id),
                merchant_id=uuid.UUID(budget.merchant_id) if budget.merchant_id else None,
                limit_minor=budget.limit.amount_minor,
                currency=budget.limit.currency.code,
                period=budget.period.value,
            )
        )
        self._session.flush()  # el budget debe existir antes de sus thresholds (FK, sin relationship)
        for percent in budget.alert_thresholds:
            self._session.add(
                BudgetAlertThresholdModel(budget_id=uuid.UUID(budget.id), percent=percent)
            )
        self._session.flush()

    def get_by_id(self, budget_id: str) -> Budget | None:
        model = self._session.get(BudgetModel, uuid.UUID(budget_id))
        if model is None:
            return None
        thresholds = self._session.scalars(
            select(BudgetAlertThresholdModel.percent).where(
                BudgetAlertThresholdModel.budget_id == uuid.UUID(budget_id)
            )
        ).all()
        return budget_to_entity(model, sorted(thresholds))

    def list_by_user(self, user_id: str) -> list[Budget]:
        models = self._session.scalars(
            select(BudgetModel).where(BudgetModel.user_id == uuid.UUID(user_id))
        ).all()
        return [self.get_by_id(str(m.id)) for m in models]  # type: ignore[misc]

    def monthly_limit_by_currency(self, user_id: str) -> dict[str, int]:
        """Σ de los límites de los budgets mensuales del usuario, por moneda."""
        stmt = (
            select(
                BudgetModel.currency,
                func.coalesce(func.sum(BudgetModel.limit_minor), 0),
            )
            .where(
                BudgetModel.user_id == uuid.UUID(user_id),
                BudgetModel.period == BudgetPeriod.MONTHLY.value,
            )
            .group_by(BudgetModel.currency)
        )
        return {cur: int(total) for cur, total in self._session.execute(stmt).all()}


class SqlSpaceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, space: Space) -> None:
        self._session.add(
            SpaceModel(id=uuid.UUID(space.id), user_id=uuid.UUID(space.user_id), name=space.name)
        )
        self._session.flush()
        self._sync_members(space)

    def save_members(self, space: Space) -> None:
        """Sincroniza la membresía (delete + re-insert) tras with/without_account."""
        self._session.execute(
            delete(SpaceAccountModel).where(SpaceAccountModel.space_id == uuid.UUID(space.id))
        )
        self._sync_members(space)

    def get_by_id(self, space_id: str) -> Space | None:
        model = self._session.get(SpaceModel, uuid.UUID(space_id))
        if model is None:
            return None
        account_ids = self._session.scalars(
            select(SpaceAccountModel.account_id).where(
                SpaceAccountModel.space_id == uuid.UUID(space_id)
            )
        ).all()
        return space_to_entity(model, [str(a) for a in account_ids])

    def list_by_user(self, user_id: str) -> list[Space]:
        models = self._session.scalars(
            select(SpaceModel).where(SpaceModel.user_id == uuid.UUID(user_id))
        ).all()
        return [self.get_by_id(str(m.id)) for m in models]  # type: ignore[misc]

    def _sync_members(self, space: Space) -> None:
        for account_id in space.account_ids:
            self._session.add(
                SpaceAccountModel(
                    space_id=uuid.UUID(space.id), account_id=uuid.UUID(account_id)
                )
            )
        self._session.flush()


class SqlSavingsGoalRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, goal: SavingsGoal) -> None:
        self._session.add(
            SavingsGoalModel(
                id=uuid.UUID(goal.id),
                user_id=uuid.UUID(goal.user_id),
                name=goal.name,
                target_minor=goal.target.amount_minor,
                currency=goal.target.currency.code,
                account_id=uuid.UUID(goal.account_id) if goal.account_id else None,
            )
        )
        self._session.flush()

    def get_by_id(self, goal_id: str) -> SavingsGoal | None:
        model = self._session.get(SavingsGoalModel, uuid.UUID(goal_id))
        return savings_goal_to_entity(model) if model else None

    def list_by_user(self, user_id: str) -> list[SavingsGoal]:
        models = self._session.scalars(
            select(SavingsGoalModel).where(SavingsGoalModel.user_id == uuid.UUID(user_id))
        ).all()
        return [savings_goal_to_entity(m) for m in models]


class SqlRecurringRuleRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, rule: RecurringRule) -> None:
        merchant_id = get_or_create_merchant(self._session, rule.user_id, rule.merchant)
        self._session.add(
            RecurringRuleModel(
                id=uuid.UUID(rule.id),
                user_id=uuid.UUID(rule.user_id),
                type=rule.type.value,
                amount_minor=rule.amount.amount_minor,
                currency=rule.amount.currency.code,
                account_id=uuid.UUID(rule.account_id),
                counter_account_id=uuid.UUID(rule.counter_account_id),
                cadence=rule.cadence.value,
                next_run=rule.next_run,
                active=rule.active,
                merchant_id=merchant_id,
                note=rule.note,
            )
        )
        self._session.flush()

    def get_by_id(self, rule_id: str) -> RecurringRule | None:
        model = self._session.get(RecurringRuleModel, uuid.UUID(rule_id))
        if model is None:
            return None
        merchant = (
            self._session.get(MerchantModel, model.merchant_id) if model.merchant_id else None
        )
        return recurring_rule_to_entity(model, merchant)

    def list_by_user(self, user_id: str) -> list[RecurringRule]:
        models = self._session.scalars(
            select(RecurringRuleModel).where(
                RecurringRuleModel.user_id == uuid.UUID(user_id)
            )
        ).all()
        return [self.get_by_id(str(m.id)) for m in models]  # type: ignore[misc]

    def list_due(self, user_id: str, as_of) -> list[RecurringRule]:  # noqa: ANN001
        """Reglas activas vencidas a la fecha (alimenta bill reminders)."""
        models = self._session.scalars(
            select(RecurringRuleModel).where(
                RecurringRuleModel.user_id == uuid.UUID(user_id),
                RecurringRuleModel.active.is_(True),
                RecurringRuleModel.next_run <= as_of,
            )
        ).all()
        return [self.get_by_id(str(m.id)) for m in models]  # type: ignore[misc]

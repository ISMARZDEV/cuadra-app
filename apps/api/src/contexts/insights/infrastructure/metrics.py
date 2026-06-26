"""Agregaciones SQL para las métricas de Insights (infra · ADR 31).

Σ de postings en SQL (no en memoria), uniendo `posting → account` (tipo + usuario) y, para
flujos, `posting → journal_entry` (fecha). Devuelve `currency_code → Σ minor` por moneda.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.contexts.insights.domain.ledger import AccountType

from .models import (
    AccountModel,
    JournalEntryModel,
    PostingModel,
    SavingsGoalModel,
)


class SqlInsightsMetricsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def balance_by_currency(
        self, user_id: str, account_type: AccountType
    ) -> dict[str, int]:
        stmt = (
            select(
                AccountModel.currency,
                func.coalesce(func.sum(PostingModel.amount_minor), 0),
            )
            .join(AccountModel, AccountModel.id == PostingModel.account_id)
            .where(
                AccountModel.user_id == uuid.UUID(user_id),
                AccountModel.type == account_type.value,
            )
            .group_by(AccountModel.currency)
        )
        return {cur: int(total) for cur, total in self._session.execute(stmt).all()}

    def balances_by_account(self, user_id: str) -> dict[str, int]:
        """Saldo derivado (Σ postings) de cada cuenta del usuario. account_id → minor."""
        stmt = (
            select(
                AccountModel.id,
                func.coalesce(func.sum(PostingModel.amount_minor), 0),
            )
            .join(PostingModel, PostingModel.account_id == AccountModel.id)
            .where(AccountModel.user_id == uuid.UUID(user_id))
            .group_by(AccountModel.id)
        )
        return {str(acc_id): int(total) for acc_id, total in self._session.execute(stmt).all()}

    def savings_by_currency(self, user_id: str) -> dict[str, int]:
        """Σ saldo de las wallets ligadas a metas de ahorro (savings_goal.account_id)."""
        stmt = (
            select(
                AccountModel.currency,
                func.coalesce(func.sum(PostingModel.amount_minor), 0),
            )
            .select_from(SavingsGoalModel)
            .join(AccountModel, AccountModel.id == SavingsGoalModel.account_id)
            .join(PostingModel, PostingModel.account_id == AccountModel.id)
            .where(SavingsGoalModel.user_id == uuid.UUID(user_id))
            .group_by(AccountModel.currency)
        )
        return {cur: int(total) for cur, total in self._session.execute(stmt).all()}

    def flow_by_currency(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> dict[str, int]:
        stmt = (
            select(
                AccountModel.currency,
                func.coalesce(func.sum(PostingModel.amount_minor), 0),
            )
            .join(AccountModel, AccountModel.id == PostingModel.account_id)
            .join(JournalEntryModel, JournalEntryModel.id == PostingModel.journal_entry_id)
            .where(
                AccountModel.user_id == uuid.UUID(user_id),
                AccountModel.type == account_type.value,
                JournalEntryModel.entry_date >= since,
                JournalEntryModel.entry_date <= until,
            )
            .group_by(AccountModel.currency)
        )
        return {cur: int(total) for cur, total in self._session.execute(stmt).all()}

"""Agregaciones SQL para la pantalla de reportes de Insights (🥧 · infra · ADR 31).

Σ de postings en SQL (no en memoria), uniendo `posting → account` (tipo + nombre + moneda)
y `posting → journal_entry` (fecha). Devuelve datos crudos; el signo (income con saldo
natural −) lo voltea la capa de aplicación. Por moneda y, para el breakdown, por mes.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.contexts.insights.domain.ledger import AccountType

from .models import AccountModel, JournalEntryModel, PostingModel


class SqlReportsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def spend_by_category(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> list[tuple[str, str, str | None, str, int]]:
        stmt = (
            select(
                AccountModel.id,
                AccountModel.name,
                AccountModel.icon,
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
            .group_by(AccountModel.id, AccountModel.name, AccountModel.icon, AccountModel.currency)
        )
        return [
            (str(acc_id), name, icon, currency, int(total))
            for acc_id, name, icon, currency, total in self._session.execute(stmt).all()
        ]

    def monthly_flow(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> dict[tuple[str, str], int]:
        month = func.to_char(JournalEntryModel.entry_date, "YYYY-MM")
        stmt = (
            select(
                month,
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
            .group_by(month, AccountModel.currency)
        )
        return {
            (m, currency): int(total)
            for m, currency, total in self._session.execute(stmt).all()
        }

"""Implementaciones SQLAlchemy de los repos del ledger de Insights (infra · ADR 31).

La **`Session` ES el Unit of Work**. El saldo se DERIVA en SQL (`SUM(amount_minor)` por
`account_id` — sin filtrar moneda, porque `account` es mono-moneda; §12·B). El `merchant`
se resuelve get-or-create por (user_id, name) para no repetir nombre/logo (normalizado §5.6).
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.contexts.insights.domain.entities import Transaction
from src.contexts.insights.domain.ledger import Account, JournalEntry
from src.shared.money import Money

from .mappers import account_to_entity, transaction_to_entity
from .merchant import get_or_create_merchant
from .models import (
    AccountModel,
    JournalEntryModel,
    MerchantModel,
    PostingModel,
    TransactionModel,
)


class SqlAccountRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, account: Account) -> None:
        self._session.add(
            AccountModel(
                id=uuid.UUID(account.id),
                user_id=uuid.UUID(account.user_id),
                type=account.type.value,
                currency=account.currency.code,
                name=account.name,
                icon=account.icon,
            )
        )
        self._session.flush()

    def get_by_id(self, account_id: str) -> Account | None:
        model = self._session.get(AccountModel, uuid.UUID(account_id))
        return account_to_entity(model) if model else None

    def list_by_user(self, user_id: str) -> list[Account]:
        models = self._session.scalars(
            select(AccountModel).where(AccountModel.user_id == uuid.UUID(user_id))
        ).all()
        return [account_to_entity(m) for m in models]


class SqlLedgerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def post(
        self, entry: JournalEntry, user_id: str, transaction_id: str | None = None
    ) -> None:
        """Persiste un asiento ya validado (Σ=0) + sus postings."""
        model = JournalEntryModel(
            user_id=uuid.UUID(user_id),
            entry_date=entry.date,
            description=entry.description,
            transaction_id=uuid.UUID(transaction_id) if transaction_id else None,
        )
        self._session.add(model)
        self._session.flush()  # asigna model.id (RETURNING) para los postings
        for posting in entry.postings:
            self._session.add(
                PostingModel(
                    journal_entry_id=model.id,
                    account_id=uuid.UUID(posting.account_id),
                    amount_minor=posting.amount.amount_minor,
                )
            )
        self._session.flush()

    def balance_of(self, account: Account) -> Money:
        """Saldo derivado: Σ postings de la cuenta (su moneda la da la cuenta · §12·B)."""
        total = self._session.execute(
            select(func.coalesce(func.sum(PostingModel.amount_minor), 0)).where(
                PostingModel.account_id == uuid.UUID(account.id)
            )
        ).scalar_one()
        return Money(int(total), account.currency)


class SqlTransactionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, tx: Transaction) -> None:
        merchant_id = get_or_create_merchant(self._session, tx.user_id, tx.merchant)
        self._session.add(
            TransactionModel(
                id=uuid.UUID(tx.id),
                user_id=uuid.UUID(tx.user_id),
                type=tx.type.value,
                amount_minor=tx.amount.amount_minor,
                currency=tx.amount.currency.code,
                account_id=uuid.UUID(tx.account_id),
                counter_account_id=uuid.UUID(tx.counter_account_id),
                occurred_at=tx.occurred_at,
                source=tx.source.value,
                idempotency_key=tx.idempotency_key,
                merchant_id=merchant_id,
                note=tx.note,
                essential=tx.essential,
                recurring=tx.recurring,
            )
        )
        self._session.flush()

    def get_by_id(self, tx_id: str) -> Transaction | None:
        model = self._session.get(TransactionModel, uuid.UUID(tx_id))
        return self._to_entity(model) if model else None

    def get_by_idempotency_key(self, user_id: str, key: str) -> Transaction | None:
        model = self._session.scalars(
            select(TransactionModel).where(
                TransactionModel.user_id == uuid.UUID(user_id),
                TransactionModel.idempotency_key == key,
            )
        ).first()
        return self._to_entity(model) if model else None

    def list_recent(self, user_id: str, limit: int) -> list[Transaction]:
        models = self._session.scalars(
            select(TransactionModel)
            .where(TransactionModel.user_id == uuid.UUID(user_id))
            .order_by(TransactionModel.occurred_at.desc())
            .limit(limit)
        ).all()
        return [self._to_entity(m) for m in models]

    # ── helpers ──────────────────────────────────────────────────────────────
    def _to_entity(self, model: TransactionModel) -> Transaction:
        merchant = (
            self._session.get(MerchantModel, model.merchant_id)
            if model.merchant_id
            else None
        )
        return transaction_to_entity(model, merchant)

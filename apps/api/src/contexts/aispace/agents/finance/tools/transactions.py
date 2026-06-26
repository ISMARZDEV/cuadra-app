"""Tool determinística `register_transaction` del FinanceAgent.

Adapta el use case `RecordTransaction` de Insights a una tool del agente (D2): el LLM solo
provee args de NEGOCIO (monto, categoría); la aritmética minor-units y la escritura viven
en el use case, NUNCA en el modelo (§7.3). El `user_id` se liga por CLOSURE (anti-IDOR
§12.1) — el LLM jamás lo provee. UoW propia por llamada (D1: el grafo pausa entre requests,
no hay sesión request-scoped que sobreviva el HITL).
"""
from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager
from datetime import datetime

from sqlalchemy.orm import Session

from src.contexts.insights.application.accounts import CreateCategory
from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.domain.entities import Merchant, Transaction, TransactionType
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.shared.ids import new_id
from src.shared.money import Money

SessionFactory = Callable[[], AbstractContextManager[Session]]


class FinanceToolError(Exception):
    """Error de negocio de una tool de finanzas (se redacta al usuario, no rompe el grafo)."""


def _primary_wallet(accounts: SqlAccountRepository, user_id: str) -> Account:
    wallets = [a for a in accounts.list_by_user(user_id) if a.type is AccountType.ASSET]
    if not wallets:
        raise FinanceToolError(
            "No tienes una wallet todavía. Crea una (p. ej. 'Banco') antes de registrar gastos."
        )
    return wallets[0]


def _resolve_expense_category(
    accounts: SqlAccountRepository, user_id: str, name: str, currency
) -> Account:  # noqa: ANN001
    for acc in accounts.list_by_user(user_id):
        if acc.type is AccountType.EXPENSE and acc.name.lower() == name.lower():
            return acc  # reutiliza la categoría existente
    return CreateCategory(accounts).execute(
        user_id=user_id, name=name, kind=AccountType.EXPENSE, currency=currency
    )


def build_register_transaction(user_id: str, session_factory: SessionFactory):  # type: ignore[no-untyped-def]
    """Devuelve la tool con `user_id` ligado por closure (anti-IDOR §12.1)."""

    def register_transaction(
        amount: float,
        category: str,
        *,
        merchant: str | None = None,
        note: str | None = None,
    ) -> dict:
        """Registra un gasto del usuario. `amount` en unidades mayores (500 = RD$500)."""
        with session_factory() as session:
            accounts = SqlAccountRepository(session)
            wallet = _primary_wallet(accounts, user_id)
            cat = _resolve_expense_category(accounts, user_id, category, wallet.currency)
            tx = Transaction(
                id=new_id(),
                user_id=user_id,
                type=TransactionType.EXPENSE,
                amount=Money(round(amount * 100), wallet.currency),  # aritmética AQUÍ, no en el LLM
                account_id=wallet.id,
                counter_account_id=cat.id,
                occurred_at=datetime.now(),
                merchant=Merchant(merchant) if merchant else None,
                note=note,
            )
            use_case = RecordTransaction(
                accounts, SqlTransactionRepository(session), SqlLedgerRepository(session)
            )
            result = use_case.execute(tx)
            session.commit()
            return {
                "transaction_id": result.id,
                "amount_minor": result.amount.amount_minor,
                "currency": result.amount.currency.code,
                "category": cat.name,
                "wallet": wallet.name,
            }

    return register_transaction

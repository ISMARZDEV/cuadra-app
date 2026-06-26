"""Tools de gasto del FinanceAgent (write path): STAGE (lo que llama el LLM) + EXECUTE.

El LLM solo provee args de NEGOCIO; la aritmética minor-units y la escritura viven en el
use case `RecordTransaction` de Insights (D2, §7.3). El `user_id` se liga por CLOSURE
(anti-IDOR §12.1). UoW propia por llamada (D1).

HITL (§7.4): la tool de escritura NO escribe — **stagea** la acción en un dict (closure) y
el grafo pide confirmación; recién al aprobar, `execute_register_transaction` persiste.
"""
from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime

from langchain_core.tools import tool
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
from src.shared.money import Currency, Money

SessionFactory = Callable[[], AbstractContextManager[Session]]


class FinanceToolError(Exception):
    """Error de negocio de una tool de finanzas. Lleva `code` + `params` (NO prosa) para que
    quien lo captura lo localice vía el catálogo i18n (el mensaje al usuario va en su idioma)."""

    def __init__(self, code: str, **params: object) -> None:
        self.code = code
        self.params = params
        super().__init__(code)


def _resolve_wallet(
    accounts: SqlAccountRepository, user_id: str, currency_code: str | None
) -> Account:
    """Wallet del usuario. Si se dio moneda, la que la usa; si no, la primaria (1ª asset)."""
    wallets = [a for a in accounts.list_by_user(user_id) if a.type is AccountType.ASSET]
    if not wallets:
        raise FinanceToolError("no_wallet")
    if currency_code is None:
        return wallets[0]
    code = Currency(currency_code).code  # normaliza/valida ISO
    match = [w for w in wallets if w.currency.code == code]
    if not match:
        raise FinanceToolError("no_currency_wallet", currency=code)
    return match[0]


def _resolve_category(
    accounts: SqlAccountRepository, user_id: str, name: str, currency, kind: AccountType
) -> Account:  # noqa: ANN001
    for acc in accounts.list_by_user(user_id):
        if acc.type is kind and acc.name.lower() == name.lower():
            return acc  # reutiliza la categoría existente (income o expense)
    return CreateCategory(accounts).execute(
        user_id=user_id, name=name, kind=kind, currency=currency
    )


def build_stage_register_transaction(staging: dict):  # type: ignore[no-untyped-def]
    """Tool que llama el LLM: NO escribe — stagea la acción para el HITL (patrón del reuso)."""

    @tool
    def register_transaction(
        amount: float,
        category: str,
        kind: str = "expense",
        merchant: str | None = None,
        currency: str | None = None,
    ) -> str:
        """Log the user's transaction (an expense or income). Call whenever the user reports
        money moving.

        kind: "expense" if they spent/paid/bought; "income" if they were paid/earned/received
            (salary, freelance...).
        amount: the EXACT amount in major units, INCLUDING cents — "RD$45.50"→45.50 (NOT 45),
            "1,200"→1200, "500"→500. Never round or drop decimals.
        category: short (Gas, Food, Rent, Salary, Freelance...).
        currency: ISO 4217 code ONLY if the user names it ("dollars"→USD, "colombian pesos"→COP,
            "reais"→BRL); otherwise null (the default wallet is used).
        The action is confirmed with the user before it is applied."""
        cur = (currency.upper() + " ") if currency else ""
        verb = "ingreso" if kind == "income" else "gasto"
        staging["action"] = {
            "amount": amount,
            "category": category,
            "kind": kind,
            "merchant": merchant,
            "currency": currency.upper() if currency else None,
            "summary": f"registrar {verb} de {cur}{amount:,.2f} en {category}",
            "requires_confirmation": True,
        }
        return f"Preparado: {verb} de {cur}{amount:,.2f} en {category}. Falta tu confirmación."

    return register_transaction


def execute_register_transaction(
    user_id: str,
    session_factory: SessionFactory,
    *,
    amount: float,
    category: str,
    kind: str = "expense",
    merchant: str | None = None,
    note: str | None = None,
    currency: str | None = None,
) -> dict:
    """Escritura real (tras el HITL): resuelve wallet (por moneda si se dio) + categoría y persiste."""
    is_income = kind == "income"
    tx_type = TransactionType.INCOME if is_income else TransactionType.EXPENSE
    cat_type = AccountType.INCOME if is_income else AccountType.EXPENSE
    with session_factory() as session:
        accounts = SqlAccountRepository(session)
        wallet = _resolve_wallet(accounts, user_id, currency)
        cat = _resolve_category(accounts, user_id, category, wallet.currency, cat_type)
        tx = Transaction(
            id=new_id(),
            user_id=user_id,
            type=tx_type,
            amount=Money.from_major(amount, wallet.currency),  # exponente por moneda, no ×100
            account_id=wallet.id,
            counter_account_id=cat.id,
            occurred_at=datetime.now(),
            merchant=Merchant(merchant) if merchant else None,
            note=note,
        )
        result = RecordTransaction(
            accounts, SqlTransactionRepository(session), SqlLedgerRepository(session)
        ).execute(tx)
        session.commit()
        return {
            "transaction_id": result.id,
            "amount_minor": result.amount.amount_minor,
            "currency": result.amount.currency.code,
            "display": result.amount.format(),  # 'USD 45.50' / 'JPY 500' (decimales por moneda)
            "category": cat.name,
            "wallet": wallet.name,
        }

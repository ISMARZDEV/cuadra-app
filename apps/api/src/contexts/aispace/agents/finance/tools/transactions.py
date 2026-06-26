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
    """Error de negocio de una tool de finanzas (se redacta al usuario, no rompe el grafo)."""


def _resolve_wallet(
    accounts: SqlAccountRepository, user_id: str, currency_code: str | None
) -> Account:
    """Wallet del usuario. Si se dio moneda, la que la usa; si no, la primaria (1ª asset)."""
    wallets = [a for a in accounts.list_by_user(user_id) if a.type is AccountType.ASSET]
    if not wallets:
        raise FinanceToolError(
            "No tienes una wallet todavía. Crea una (p. ej. 'Banco') antes de registrar gastos."
        )
    if currency_code is None:
        return wallets[0]
    code = Currency(currency_code).code  # normaliza/valida ISO
    match = [w for w in wallets if w.currency.code == code]
    if not match:
        raise FinanceToolError(
            f"No tienes una wallet en {code}. Crea una primero o usa otra moneda."
        )
    return match[0]


def _resolve_expense_category(
    accounts: SqlAccountRepository, user_id: str, name: str, currency
) -> Account:  # noqa: ANN001
    for acc in accounts.list_by_user(user_id):
        if acc.type is AccountType.EXPENSE and acc.name.lower() == name.lower():
            return acc  # reutiliza la categoría existente
    return CreateCategory(accounts).execute(
        user_id=user_id, name=name, kind=AccountType.EXPENSE, currency=currency
    )


def build_stage_register_transaction(staging: dict):  # type: ignore[no-untyped-def]
    """Tool que llama el LLM: NO escribe — stagea la acción para el HITL (patrón del reuso)."""

    @tool
    def register_transaction(
        amount: float, category: str, merchant: str | None = None, currency: str | None = None
    ) -> str:
        """Registra un GASTO del usuario. Úsala cuando diga que gastó/pagó/compró algo.

        `amount`: el monto EXACTO en unidades mayores, INCLUYENDO los centavos —
        "RD$45.50" → 45.50 (NO 45), "1,200" → 1200, "500" → 500. Nunca redondees ni
        descartes los decimales. `category`: corta (Gasolina, Comida, Renta…).
        `currency`: SOLO si el usuario menciona la moneda — pásala como código ISO 4217
        ("dólares"/"USD"→USD, "pesos colombianos"→COP, "yenes"→JPY). Si no la menciona,
        déjala en null (se usa la wallet por defecto). La acción se confirma antes de aplicarse."""
        cur = (currency.upper() + " ") if currency else ""
        staging["action"] = {
            "amount": amount,
            "category": category,
            "merchant": merchant,
            "currency": currency.upper() if currency else None,
            "summary": f"registrar {cur}{amount:,.2f} en {category}",
            "requires_confirmation": True,
        }
        return f"Preparado: registrar {cur}{amount:,.2f} en {category}. Falta tu confirmación."

    return register_transaction


def execute_register_transaction(
    user_id: str,
    session_factory: SessionFactory,
    *,
    amount: float,
    category: str,
    merchant: str | None = None,
    note: str | None = None,
    currency: str | None = None,
) -> dict:
    """Escritura real (tras el HITL): resuelve wallet (por moneda si se dio) + categoría y persiste."""
    with session_factory() as session:
        accounts = SqlAccountRepository(session)
        wallet = _resolve_wallet(accounts, user_id, currency)
        cat = _resolve_expense_category(accounts, user_id, category, wallet.currency)
        tx = Transaction(
            id=new_id(),
            user_id=user_id,
            type=TransactionType.EXPENSE,
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

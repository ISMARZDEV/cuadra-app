"""Unit — Transaction (§5.2) → genera el asiento balanceado del ledger (§12·B).

La `Transaction` es lo que el usuario crea (income/expense/transfer). Su trabajo de
dominio es traducirse a un `JournalEntry` de doble entrada — el puente entre la UI y el
ledger. El monto es una magnitud (>0); el SIGNO lo decide el tipo:
- income  → entra a la wallet:   DR account +  / CR counter(income)  −
- expense → sale de la wallet:   DR counter(expense) + / CR account  −
- transfer→ sale de la wallet:   DR counter(destino) + / CR account  −
"""
from __future__ import annotations

from datetime import datetime

import pytest

from src.contexts.insights.domain.entities import (
    Merchant,
    Transaction,
    TransactionSource,
    TransactionType,
)
from src.contexts.insights.domain.ledger import (
    Account,
    AccountType,
    Ledger,
    UnbalancedEntryError,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")
WHEN = datetime(2026, 6, 10, 20, 5)


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


# cuentas
BANCO = Account("acc-banco", "u1", AccountType.ASSET, DOP, "Banco")
EFECTIVO = Account("acc-efectivo", "u1", AccountType.ASSET, DOP, "Efectivo")
COMBUSTIBLE = Account("acc-fuel", "u1", AccountType.EXPENSE, DOP, "Combustible")
SUBSCRIPTIONS = Account("acc-subs", "u1", AccountType.EXPENSE, DOP, "Subscriptions")
SALARY = Account("acc-salary", "u1", AccountType.INCOME, DOP, "Salary")
CREDIT_CARD = Account("acc-cc", "u1", AccountType.LIABILITY, DOP, "Credit Card")


def _tx(type_: TransactionType, account_id: str, counter_id: str, minor: int) -> Transaction:
    return Transaction(
        id="tx-1",
        user_id="u1",
        type=type_,
        amount=_dop(minor),
        account_id=account_id,
        counter_account_id=counter_id,
        occurred_at=WHEN,
    )


# ── tipos y fuentes ──────────────────────────────────────────────────────────
def test_transaction_type_values() -> None:
    assert {t.value for t in TransactionType} == {"income", "expense", "transfer"}


def test_transaction_source_values() -> None:
    assert {s.value for s in TransactionSource} == {"manual", "voice", "ocr"}


# ── EXPENSE: Shell −$500 desde Banco ─────────────────────────────────────────
def test_expense_generates_balanced_entry() -> None:
    tx = _tx(TransactionType.EXPENSE, BANCO.id, COMBUSTIBLE.id, 50_000)
    entry = tx.to_journal_entry()

    amounts = {p.account_id: p.amount for p in entry.postings}
    assert amounts[COMBUSTIBLE.id] == _dop(50_000)   # DR gasto +
    assert amounts[BANCO.id] == _dop(-50_000)        # CR wallet −

    ledger = Ledger()
    ledger.post(entry)
    assert ledger.balance_of(BANCO) == _dop(-50_000)
    assert ledger.balance_of(COMBUSTIBLE) == _dop(50_000)


# ── INCOME: salario +$20,000 al Banco ────────────────────────────────────────
def test_income_generates_balanced_entry() -> None:
    tx = _tx(TransactionType.INCOME, BANCO.id, SALARY.id, 2_000_000)
    entry = tx.to_journal_entry()

    amounts = {p.account_id: p.amount for p in entry.postings}
    assert amounts[BANCO.id] == _dop(2_000_000)      # DR wallet + (entra)
    assert amounts[SALARY.id] == _dop(-2_000_000)    # CR income −

    ledger = Ledger()
    ledger.post(entry)
    assert ledger.balance_of(BANCO) == _dop(2_000_000)
    assert ledger.balance_of(SALARY) == _dop(-2_000_000)


# ── TRANSFER: $1,000 Efectivo → Banco ────────────────────────────────────────
def test_transfer_generates_balanced_entry() -> None:
    tx = _tx(TransactionType.TRANSFER, EFECTIVO.id, BANCO.id, 100_000)
    entry = tx.to_journal_entry()

    amounts = {p.account_id: p.amount for p in entry.postings}
    assert amounts[BANCO.id] == _dop(100_000)        # DR destino +
    assert amounts[EFECTIVO.id] == _dop(-100_000)    # CR origen −

    ledger = Ledger()
    ledger.post(entry)
    assert ledger.balance_of(BANCO) == _dop(100_000)
    assert ledger.balance_of(EFECTIVO) == _dop(-100_000)


# ── EXPENSE con tarjeta de crédito (account = liability) ─────────────────────
def test_expense_paid_with_credit_card_increases_debt() -> None:
    tx = _tx(TransactionType.EXPENSE, CREDIT_CARD.id, SUBSCRIPTIONS.id, 35_000)
    ledger = Ledger()
    ledger.post(tx.to_journal_entry())
    assert ledger.balance_of(CREDIT_CARD) == _dop(-35_000)  # sube la deuda
    assert ledger.balance_of(SUBSCRIPTIONS) == _dop(35_000)  # cuenta como gasto


# ── el asiento generado SIEMPRE cuadra ───────────────────────────────────────
def test_generated_entry_is_always_balanced() -> None:
    for type_, a, c in [
        (TransactionType.INCOME, BANCO.id, SALARY.id),
        (TransactionType.EXPENSE, BANCO.id, COMBUSTIBLE.id),
        (TransactionType.TRANSFER, EFECTIVO.id, BANCO.id),
    ]:
        # construir el asiento no debe lanzar UnbalancedEntryError
        _tx(type_, a, c, 12_345).to_journal_entry()


# ── invariantes de la propia Transaction ─────────────────────────────────────
def test_amount_must_be_positive() -> None:
    with pytest.raises(ValueError):
        _tx(TransactionType.EXPENSE, BANCO.id, COMBUSTIBLE.id, 0)
    with pytest.raises(ValueError):
        _tx(TransactionType.EXPENSE, BANCO.id, COMBUSTIBLE.id, -500)


def test_transfer_to_same_account_raises() -> None:
    with pytest.raises(ValueError):
        _tx(TransactionType.TRANSFER, BANCO.id, BANCO.id, 100_000)


# ── enrichment opcional (§5.6): merchant, source, flags ──────────────────────
def test_optional_enrichment_fields() -> None:
    tx = Transaction(
        id="tx-2",
        user_id="u1",
        type=TransactionType.EXPENSE,
        amount=_dop(35_000),
        account_id=BANCO.id,
        counter_account_id=SUBSCRIPTIONS.id,
        occurred_at=WHEN,
        source=TransactionSource.VOICE,
        merchant=Merchant(name="Spotify", logo_url="https://logo/spotify.png"),
        idempotency_key="idem-123",
        essential=False,
        recurring=True,
    )
    assert tx.merchant.name == "Spotify"
    assert tx.source is TransactionSource.VOICE
    assert tx.recurring is True
    # default sano cuando no se especifica
    assert _tx(TransactionType.EXPENSE, BANCO.id, COMBUSTIBLE.id, 500).source is (
        TransactionSource.MANUAL
    )

"""Unit — Ledger de doble entrada (§12·B, ADR 14 · ver docs/sdd/insights-ledger.md).

Los 7 invariantes de los que depende TODO saldo del sistema. El dinero no lo toca
el modelo: son enteros (minor units) validados en construcción. Convención de signos:
DÉBITO = positivo, CRÉDITO = negativo; `Σ postings = 0` POR MONEDA en cada asiento.
"""
from __future__ import annotations

from datetime import date

import pytest

from src.contexts.insights.domain.ledger import (
    Account,
    AccountType,
    JournalEntry,
    Ledger,
    Posting,
    UnbalancedEntryError,
)
from src.shared.money import Currency, CurrencyMismatchError, Money

DOP = Currency("DOP")
USD = Currency("USD")
TODAY = date(2026, 6, 26)


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


# ── Cuentas de prueba (un usuario) ──────────────────────────────────────────
BANCO = Account("acc-banco", "u1", AccountType.ASSET, DOP, "Banco")
EFECTIVO = Account("acc-efectivo", "u1", AccountType.ASSET, DOP, "Efectivo")
COMBUSTIBLE = Account("acc-fuel", "u1", AccountType.EXPENSE, DOP, "Combustible")
SUBSCRIPTIONS = Account("acc-subs", "u1", AccountType.EXPENSE, DOP, "Subscriptions")
SALARY = Account("acc-salary", "u1", AccountType.INCOME, DOP, "Salary")
OPENING = Account("acc-opening", "u1", AccountType.EQUITY, DOP, "Opening Balance")
CREDIT_CARD = Account("acc-cc", "u1", AccountType.LIABILITY, DOP, "Credit Card")
WALLET_USD = Account("acc-usd", "u1", AccountType.ASSET, USD, "Wallet USD")


def _entry(desc: str, *postings: Posting) -> JournalEntry:
    return JournalEntry("je-x", TODAY, desc, postings)


# ── Invariante 0: taxonomía de cuentas ──────────────────────────────────────
def test_account_type_has_the_five_accounting_types() -> None:
    assert {t.value for t in AccountType} == {
        "asset",
        "liability",
        "income",
        "expense",
        "equity",
    }


# ── Invariante 1: asiento balanceado construye; desbalanceado revienta ───────
def test_balanced_entry_constructs() -> None:
    # Shell · Combustible: DR expense +500 / CR asset -500
    entry = _entry(
        "Shell",
        Posting(COMBUSTIBLE.id, _dop(50_000)),
        Posting(BANCO.id, _dop(-50_000)),
    )
    assert len(entry.postings) == 2


def test_unbalanced_entry_raises() -> None:
    with pytest.raises(UnbalancedEntryError):
        _entry(
            "rota",
            Posting(COMBUSTIBLE.id, _dop(50_000)),
            Posting(BANCO.id, _dop(-49_999)),  # no suma 0
        )


# ── Invariante 2: < 2 postings rechazado ─────────────────────────────────────
def test_entry_requires_at_least_two_postings() -> None:
    with pytest.raises(ValueError):
        _entry("solo-uno", Posting(BANCO.id, _dop(0)))


# ── Invariante 3: balance(account) = Σ postings ──────────────────────────────
def test_balance_of_sums_postings_across_entries() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "Opening · Banco",
            Posting(BANCO.id, _dop(5_000_000)),
            Posting(OPENING.id, _dop(-5_000_000)),
        )
    )
    ledger.post(
        _entry(
            "Salario",
            Posting(BANCO.id, _dop(2_000_000)),
            Posting(SALARY.id, _dop(-2_000_000)),
        )
    )
    ledger.post(
        _entry(
            "Shell",
            Posting(COMBUSTIBLE.id, _dop(50_000)),
            Posting(BANCO.id, _dop(-50_000)),
        )
    )
    assert ledger.balance_of(BANCO) == _dop(6_950_000)
    assert ledger.balance_of(SALARY) == _dop(-2_000_000)  # display: +$20,000
    assert ledger.balance_of(COMBUSTIBLE) == _dop(50_000)
    assert ledger.balance_of(OPENING) == _dop(-5_000_000)


# ── Invariante 4: transfer entre activos NO toca income/expense ──────────────
def test_transfer_between_assets_moves_balance_only() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "Transfer Efectivo → Banco",
            Posting(BANCO.id, _dop(100_000)),
            Posting(EFECTIVO.id, _dop(-100_000)),
        )
    )
    assert ledger.balance_of(BANCO) == _dop(100_000)
    assert ledger.balance_of(EFECTIVO) == _dop(-100_000)
    # ningún income/expense afectado
    assert ledger.balance_of(SALARY) == _dop(0)
    assert ledger.balance_of(COMBUSTIBLE) == _dop(0)


# ── Invariante 5: compra con tarjeta es gasto; pagar la tarjeta NO ───────────
def test_credit_card_purchase_then_payment() -> None:
    ledger = Ledger()
    # ⑤ Spotify con crédito: gasto +350, deuda sube
    ledger.post(
        _entry(
            "Spotify · crédito",
            Posting(SUBSCRIPTIONS.id, _dop(35_000)),
            Posting(CREDIT_CARD.id, _dop(-35_000)),
        )
    )
    assert ledger.balance_of(CREDIT_CARD) == _dop(-35_000)  # debe $350
    assert ledger.balance_of(SUBSCRIPTIONS) == _dop(35_000)
    # ⑥ pago de la tarjeta desde Banco: NO es gasto
    ledger.post(
        _entry(
            "Pago tarjeta",
            Posting(CREDIT_CARD.id, _dop(35_000)),
            Posting(BANCO.id, _dop(-35_000)),
        )
    )
    assert ledger.balance_of(CREDIT_CARD) == _dop(0)  # saldada
    assert ledger.balance_of(SUBSCRIPTIONS) == _dop(35_000)  # el gasto se cuenta UNA vez
    assert ledger.balance_of(BANCO) == _dop(-35_000)


# ── Invariante 6: opening via equity NO infla income ─────────────────────────
def test_opening_balance_via_equity_is_not_income() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "Opening · Banco",
            Posting(BANCO.id, _dop(5_000_000)),
            Posting(OPENING.id, _dop(-5_000_000)),
        )
    )
    assert ledger.balance_of(BANCO) == _dop(5_000_000)
    assert ledger.balance_of(SALARY) == _dop(0)  # income intacto


# ── Invariante 7: asiento multi-moneda (FX) que no cuadra por moneda → rechazo ─
def test_mixed_currency_entry_that_is_not_balanced_per_currency_raises() -> None:
    # Conversión DOP→USD sin cuenta de cambio: USD=+100, DOP=-5900, ninguna suma 0.
    with pytest.raises(UnbalancedEntryError):
        _entry(
            "FX DOP→USD (sin clearing)",
            Posting(WALLET_USD.id, Money(10_000, USD)),
            Posting(BANCO.id, _dop(-590_000)),
        )


def test_balance_of_rejects_posting_in_wrong_currency() -> None:
    # Un posting en USD a una cuenta DOP → CurrencyMismatch al sumar el balance.
    ledger = Ledger()
    ledger.post(
        _entry(
            "USD a cuenta USD (válido por moneda)",
            Posting(BANCO.id, Money(10_000, USD)),
            Posting(WALLET_USD.id, Money(-10_000, USD)),
        )
    )
    with pytest.raises(CurrencyMismatchError):
        ledger.balance_of(BANCO)  # BANCO es DOP; recibió un posting USD

"""Integration — GetInsightsMetrics: las métricas de §5.3 derivadas del ledger por SQL.

Reproduce los asientos del doc (opening vía equity, salario, Shell, Spotify con crédito)
y verifica que salen las tarjetas del frontend: Total Income / Expenses / Balance (neto),
Total balance por moneda (assets) y Net worth (assets + liabilities).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session

from src.contexts.insights.application.metrics import GetInsightsMetrics
from src.contexts.insights.domain.entities import Transaction, TransactionType
from src.contexts.insights.domain.ledger import (
    Account,
    AccountType,
    JournalEntry,
    Posting,
)
from src.contexts.insights.domain.entities import SavingsGoal
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.planning import SqlSavingsGoalRepository
from src.contexts.insights.infrastructure.repositories import (
    SqlAccountRepository,
    SqlLedgerRepository,
    SqlTransactionRepository,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USER = str(uuid.uuid4())
JUN = (date(2026, 6, 1), date(2026, 6, 30))


def _acc(type_: AccountType, name: str) -> Account:
    return Account(str(uuid.uuid4()), USER, type_, DOP, name)


def _record_expense(txs, ledger, account, counter, minor, when) -> None:  # type: ignore[no-untyped-def]
    tx = Transaction(
        str(uuid.uuid4()), USER, TransactionType.EXPENSE, Money(minor, DOP),
        account.id, counter.id, when,
    )
    txs.add(tx)
    ledger.post(tx.to_journal_entry(), USER, tx.id)


def test_insights_metrics_from_ledger(db_session: Session) -> None:
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    txs = SqlTransactionRepository(db_session)
    use_case = GetInsightsMetrics(SqlInsightsMetricsRepository(db_session))

    banco = _acc(AccountType.ASSET, "Banco")
    salary = _acc(AccountType.INCOME, "Salary")
    fuel = _acc(AccountType.EXPENSE, "Combustible")
    subs = _acc(AccountType.EXPENSE, "Subscriptions")
    credit = _acc(AccountType.LIABILITY, "Credit Card")
    opening = _acc(AccountType.EQUITY, "Opening Balance")
    for acc in (banco, salary, fuel, subs, credit, opening):
        accounts.add(acc)

    # ① Opening $50,000 vía equity (NO es income)
    ledger.post(
        JournalEntry(
            "je-open", date(2026, 6, 1), "Opening · Banco",
            (Posting(banco.id, Money(5_000_000, DOP)), Posting(opening.id, Money(-5_000_000, DOP))),
        ),
        USER,
    )
    # ② Salario +$20,000
    tx_salary = Transaction(
        str(uuid.uuid4()), USER, TransactionType.INCOME, Money(2_000_000, DOP),
        banco.id, salary.id, datetime(2026, 6, 1, 9, 0),
    )
    txs.add(tx_salary)
    ledger.post(tx_salary.to_journal_entry(), USER, tx_salary.id)
    # ③ Shell −$500
    _record_expense(txs, ledger, banco, fuel, 50_000, datetime(2026, 6, 10, 20, 5))
    # ⑤ Spotify −$350 con tarjeta de crédito
    _record_expense(txs, ledger, credit, subs, 35_000, datetime(2026, 6, 12, 0, 5))

    metrics = use_case.execute(USER, *JUN)
    by_cur = {b.currency: b for b in metrics.by_currency}
    dop = by_cur["DOP"]

    assert dop.total_income_minor == 2_000_000          # opening NO infla income
    assert dop.total_expenses_minor == 50_000 + 35_000  # = 85,000
    assert dop.balance_minor == 2_000_000 - 85_000      # neto del período = 1,915,000
    # Total balance (wallets/assets) = opening + salario − Shell (Spotify fue con crédito, no tocó asset)
    assert dop.total_balance_minor == 5_000_000 + 2_000_000 - 50_000  # 6,950,000
    # Net worth = assets + liability(con signo, deuda −35,000)
    assert dop.net_worth_minor == 6_950_000 - 35_000    # 6,915,000


def test_metrics_empty_user_returns_no_blocks(db_session: Session) -> None:
    use_case = GetInsightsMetrics(SqlInsightsMetricsRepository(db_session))
    metrics = use_case.execute(str(uuid.uuid4()), *JUN)
    assert metrics.by_currency == []


def test_savings_metric_sums_goal_linked_wallet_balances(db_session: Session) -> None:
    """Savings = Σ saldo de las wallets ligadas a metas (no la wallet de gasto corriente)."""
    accounts = SqlAccountRepository(db_session)
    ledger = SqlLedgerRepository(db_session)
    goals = SqlSavingsGoalRepository(db_session)
    use_case = GetInsightsMetrics(SqlInsightsMetricsRepository(db_session))

    ahorro = _acc(AccountType.ASSET, "Ahorro Viaje")
    corriente = _acc(AccountType.ASSET, "Banco")  # NO ligada a meta → no debe contar
    opening = _acc(AccountType.EQUITY, "Opening Balance")
    for acc in (ahorro, corriente, opening):
        accounts.add(acc)

    # Fondea solo la wallet de ahorro con $30,000 (opening vía equity)
    ledger.post(
        JournalEntry(
            "je-ahorro", date(2026, 6, 1), "Opening · Ahorro",
            (Posting(ahorro.id, Money(3_000_000, DOP)), Posting(opening.id, Money(-3_000_000, DOP))),
        ),
        USER,
    )
    goals.add(SavingsGoal(str(uuid.uuid4()), USER, "Viaje", Money(10_000_000, DOP), ahorro.id))

    dop = {b.currency: b for b in use_case.execute(USER, *JUN).by_currency}["DOP"]
    assert dop.savings_minor == 3_000_000  # solo la wallet ligada a la meta

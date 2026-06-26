"""Puertos del dominio Insights (interfaces · DIP). `typing.Protocol` = interface
structural; las implementaciones SQLAlchemy viven en `infrastructure` (ADR 31).

Inyectados por el composition_root. El dominio/aplicación dependen de estas
abstracciones, nunca de la infraestructura.
"""
from __future__ import annotations

from datetime import date
from typing import Protocol

from src.shared.money import Money

from ..entities import (
    Budget,
    RecurringRule,
    SavingsGoal,
    Space,
    Transaction,
)
from ..ledger import Account, AccountType, JournalEntry


class AccountRepository(Protocol):
    def add(self, account: Account) -> None: ...
    def get_by_id(self, account_id: str) -> Account | None: ...
    def list_by_user(self, user_id: str) -> list[Account]: ...


class LedgerRepository(Protocol):
    def post(
        self, entry: JournalEntry, user_id: str, transaction_id: str | None = None
    ) -> None: ...
    def balance_of(self, account: Account) -> Money: ...


class TransactionRepository(Protocol):
    def add(self, tx: Transaction) -> None: ...
    def get_by_id(self, tx_id: str) -> Transaction | None: ...
    def get_by_idempotency_key(self, user_id: str, key: str) -> Transaction | None: ...
    def list_recent(self, user_id: str, limit: int) -> list[Transaction]:
        """Transacciones del usuario, más recientes primero (por occurred_at)."""
        ...


class BudgetRepository(Protocol):
    def add(self, budget: Budget) -> None: ...
    def get_by_id(self, budget_id: str) -> Budget | None: ...
    def list_by_user(self, user_id: str) -> list[Budget]: ...
    def monthly_limit_by_currency(self, user_id: str) -> dict[str, int]:
        """Σ de los límites de los budgets mensuales del usuario, por moneda."""
        ...


class SpaceRepository(Protocol):
    def add(self, space: Space) -> None: ...
    def save_members(self, space: Space) -> None: ...
    def get_by_id(self, space_id: str) -> Space | None: ...
    def list_by_user(self, user_id: str) -> list[Space]: ...


class SavingsGoalRepository(Protocol):
    def add(self, goal: SavingsGoal) -> None: ...
    def get_by_id(self, goal_id: str) -> SavingsGoal | None: ...
    def list_by_user(self, user_id: str) -> list[SavingsGoal]: ...


class RecurringRuleRepository(Protocol):
    def add(self, rule: RecurringRule) -> None: ...
    def get_by_id(self, rule_id: str) -> RecurringRule | None: ...
    def list_by_user(self, user_id: str) -> list[RecurringRule]: ...
    def list_due(self, user_id: str, as_of: date) -> list[RecurringRule]: ...


class ReportsRepository(Protocol):
    """Agregaciones del ledger para la pantalla de reportes (🥧). Σ en SQL, no en memoria."""

    def spend_by_category(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> list[tuple[str, str, str | None, str, int]]:
        """Por categoría de ese tipo en [since, until]: (account_id, name, icon, currency, Σ minor)."""
        ...

    def monthly_flow(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> dict[tuple[str, str], int]:
        """Σ postings de cuentas de ese tipo agrupado por (mes 'YYYY-MM', moneda)."""
        ...


class InsightsMetricsRepository(Protocol):
    """Agregaciones del ledger para las métricas (§5.3). Σ en SQL, no en memoria."""

    def balance_by_currency(
        self, user_id: str, account_type: AccountType
    ) -> dict[str, int]:
        """Σ postings de cuentas de ese tipo, por moneda (saldo a hoy). currency_code → minor."""
        ...

    def flow_by_currency(
        self, user_id: str, account_type: AccountType, since: date, until: date
    ) -> dict[str, int]:
        """Σ postings de cuentas de ese tipo en [since, until] por fecha de asiento."""
        ...

    def savings_by_currency(self, user_id: str) -> dict[str, int]:
        """Σ saldo de las wallets ligadas a metas de ahorro (savings_goal.account_id), por moneda."""
        ...

    def balances_by_account(self, user_id: str) -> dict[str, int]:
        """Saldo derivado (Σ postings) de cada cuenta del usuario. account_id → minor."""
        ...

"""Use cases de LECTURA (CQRS-read) que alimentan el carrusel Home y las listas del navbar.

Thin: leen del repo y mapean a DTO. Sin lógica de negocio (las cifras de saldo se derivan
en SQL, §12·B). El saldo de cada wallet sale de `balances_by_account` para evitar N+1.
"""
from __future__ import annotations

from datetime import date

from src.contexts.insights.domain.ledger import AccountType
from src.contexts.insights.domain.ports import (
    AccountRepository,
    BudgetRepository,
    InsightsMetricsRepository,
    RecurringRuleRepository,
    SavingsGoalRepository,
    SpaceRepository,
    TransactionRepository,
)

from .dtos import (
    AccountResponse,
    BudgetResponse,
    RecurringRuleResponse,
    SavingsGoalResponse,
    SpaceResponse,
    TransactionResponse,
)

_WALLET_TYPES = (AccountType.ASSET, AccountType.LIABILITY)


class ListAccounts:
    """Wallets del usuario (asset/liability) con saldo. Excluye categorías y la equity interna."""

    def __init__(
        self, accounts: AccountRepository, metrics: InsightsMetricsRepository
    ) -> None:
        self._accounts = accounts
        self._metrics = metrics

    def execute(self, user_id: str) -> list[AccountResponse]:
        balances = self._metrics.balances_by_account(user_id)
        wallets = [
            a for a in self._accounts.list_by_user(user_id) if a.type in _WALLET_TYPES
        ]
        wallets.sort(key=lambda a: a.name)
        return [AccountResponse.from_entity(a, balances.get(a.id, 0)) for a in wallets]


class ListRecentTransactions:
    def __init__(self, transactions: TransactionRepository) -> None:
        self._transactions = transactions

    def execute(self, user_id: str, limit: int) -> list[TransactionResponse]:
        txs = self._transactions.list_recent(user_id, limit)
        return [TransactionResponse.from_entity(t) for t in txs]


class ListSpaces:
    def __init__(self, spaces: SpaceRepository) -> None:
        self._spaces = spaces

    def execute(self, user_id: str) -> list[SpaceResponse]:
        return [SpaceResponse.from_entity(s) for s in self._spaces.list_by_user(user_id)]


class ListBudgets:
    def __init__(self, budgets: BudgetRepository) -> None:
        self._budgets = budgets

    def execute(self, user_id: str) -> list[BudgetResponse]:
        return [BudgetResponse.from_entity(b) for b in self._budgets.list_by_user(user_id)]


class ListSavingsGoals:
    def __init__(self, goals: SavingsGoalRepository) -> None:
        self._goals = goals

    def execute(self, user_id: str) -> list[SavingsGoalResponse]:
        return [
            SavingsGoalResponse.from_entity(g) for g in self._goals.list_by_user(user_id)
        ]


class ListRecurringRules:
    """Suscripciones del usuario. Con `due_by` filtra a las vencidas (bill reminders)."""

    def __init__(self, rules: RecurringRuleRepository) -> None:
        self._rules = rules

    def execute(
        self, user_id: str, due_by: date | None = None
    ) -> list[RecurringRuleResponse]:
        rules = (
            self._rules.list_due(user_id, due_by)
            if due_by is not None
            else self._rules.list_by_user(user_id)
        )
        return [RecurringRuleResponse.from_entity(r) for r in rules]

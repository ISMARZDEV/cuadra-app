"""DTOs de Insights (Pydantic) — contrato que sale por la API. CQRS-read.

Los montos van en *minor units* (enteros) + código de moneda; el frontend formatea
con el exponente de la moneda. Nunca floats en el contrato (§12·B).
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from src.contexts.insights.domain.entities import (
    Budget,
    RecurringRule,
    SavingsGoal,
    Space,
    Transaction,
)
from src.contexts.insights.domain.ledger import Account


class AccountResponse(BaseModel):
    """Cuenta del usuario con su saldo derivado del ledger (stack de wallets, card ③)."""

    id: str
    type: str
    currency: str
    name: str
    icon: str | None = None
    balance_minor: int

    @classmethod
    def from_entity(cls, account: Account, balance_minor: int) -> AccountResponse:
        return cls(
            id=account.id,
            type=account.type.value,
            currency=account.currency.code,
            name=account.name,
            icon=account.icon,
            balance_minor=balance_minor,
        )


class MerchantDto(BaseModel):
    """Comercio normalizado (§5.6) tal como sale en la fila de Recent Transactions."""

    name: str
    logo_url: str | None = None


class TransactionResponse(BaseModel):
    """Representación del movimiento registrado (eco del POST /transactions)."""

    id: str
    type: str
    amount_minor: int
    currency: str
    account_id: str
    counter_account_id: str
    occurred_at: datetime
    source: str
    idempotency_key: str | None = None
    merchant: MerchantDto | None = None
    note: str | None = None
    essential: bool | None = None
    recurring: bool | None = None

    @classmethod
    def from_entity(cls, tx: Transaction) -> TransactionResponse:
        return cls(
            id=tx.id,
            type=tx.type.value,
            amount_minor=tx.amount.amount_minor,
            currency=tx.amount.currency.code,
            account_id=tx.account_id,
            counter_account_id=tx.counter_account_id,
            occurred_at=tx.occurred_at,
            source=tx.source.value,
            idempotency_key=tx.idempotency_key,
            merchant=(
                MerchantDto(name=tx.merchant.name, logo_url=tx.merchant.logo_url)
                if tx.merchant
                else None
            ),
            note=tx.note,
            essential=tx.essential,
            recurring=tx.recurring,
        )


class BudgetResponse(BaseModel):
    """Presupuesto creado (§5.2 + gap). El límite va en *minor units* + moneda."""

    id: str
    category_account_id: str
    limit_minor: int
    currency: str
    period: str
    merchant_id: str | None = None
    alert_thresholds: list[int]

    @classmethod
    def from_entity(cls, budget: Budget) -> BudgetResponse:
        return cls(
            id=budget.id,
            category_account_id=budget.category_account_id,
            limit_minor=budget.limit.amount_minor,
            currency=budget.limit.currency.code,
            period=budget.period.value,
            merchant_id=budget.merchant_id,
            alert_thresholds=list(budget.alert_thresholds),
        )


class SpaceResponse(BaseModel):
    """Sobre/proyecto que agrupa cuentas (card ② del carrusel)."""

    id: str
    name: str
    account_ids: list[str]

    @classmethod
    def from_entity(cls, space: Space) -> SpaceResponse:
        return cls(id=space.id, name=space.name, account_ids=sorted(space.account_ids))


class SavingsGoalResponse(BaseModel):
    """Meta de ahorro (alcancía). El objetivo va en *minor units* + moneda."""

    id: str
    name: str
    target_minor: int
    currency: str
    account_id: str | None = None

    @classmethod
    def from_entity(cls, goal: SavingsGoal) -> SavingsGoalResponse:
        return cls(
            id=goal.id,
            name=goal.name,
            target_minor=goal.target.amount_minor,
            currency=goal.target.currency.code,
            account_id=goal.account_id,
        )


class RecurringRuleResponse(BaseModel):
    """Regla recurrente / suscripción (alimenta bill reminders)."""

    id: str
    type: str
    amount_minor: int
    currency: str
    account_id: str
    counter_account_id: str
    cadence: str
    next_run: date
    active: bool
    merchant: MerchantDto | None = None
    note: str | None = None

    @classmethod
    def from_entity(cls, rule: RecurringRule) -> RecurringRuleResponse:
        return cls(
            id=rule.id,
            type=rule.type.value,
            amount_minor=rule.amount.amount_minor,
            currency=rule.amount.currency.code,
            account_id=rule.account_id,
            counter_account_id=rule.counter_account_id,
            cadence=rule.cadence.value,
            next_run=rule.next_run,
            active=rule.active,
            merchant=(
                MerchantDto(name=rule.merchant.name, logo_url=rule.merchant.logo_url)
                if rule.merchant
                else None
            ),
            note=rule.note,
        )


class CurrencyMetrics(BaseModel):
    """Las métricas de §5.3 para UNA moneda (el frontend tiene toggle DOP/USD)."""

    currency: str
    total_income_minor: int    # ingresos del período (tarjeta Total Income)
    total_expenses_minor: int  # gastos del período (tarjeta Total Bills/Expenses)
    balance_minor: int         # neto del período = income − expenses (tarjeta Balance)
    total_balance_minor: int   # Σ wallets/assets (Daily Diary "Total balance")
    net_worth_minor: int       # patrimonio neto = assets + liabilities(con signo)
    savings_minor: int         # Σ saldo de wallets ligadas a metas (tarjeta Savings)


class InsightsMetrics(BaseModel):
    by_currency: list[CurrencyMetrics]


class DailyTargetByCurrency(BaseModel):
    """"Cuánto puedo gastar hoy" derivado de los budgets mensuales (card ③)."""

    currency: str
    monthly_limit_minor: int   # Σ límites de budgets mensuales
    spent_month_minor: int     # gastado en el mes hasta hoy
    remaining_minor: int       # límite − gastado (con signo; negativo = te pasaste)
    days_remaining: int        # días que quedan del mes (incluye hoy; ≥ 1)
    daily_target_minor: int    # max(0, remaining) // days_remaining (nunca negativo)
    spent_today_minor: int     # "You spent today" = Σ gastos con fecha = hoy


class DailyTarget(BaseModel):
    by_currency: list[DailyTargetByCurrency]


class CategorySpend(BaseModel):
    """Una porción del donut: total de una categoría en el período (por moneda)."""

    category_account_id: str
    name: str
    icon: str | None = None
    currency: str
    total_minor: int


class ByCategoryReport(BaseModel):
    kind: str  # "expense" | "income"
    by_category: list[CategorySpend]  # ordenado desc por total


class MonthlyFlow(BaseModel):
    """Ingresos vs gastos de un mes (breakdown mensual, 🥧 Reportes)."""

    month: str  # "YYYY-MM"
    currency: str
    income_minor: int
    expense_minor: int


class IncomeVsExpenseReport(BaseModel):
    by_month: list[MonthlyFlow]

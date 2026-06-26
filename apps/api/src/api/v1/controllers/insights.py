"""Insights controller — HTTP boundary del contexto insights (prefijo `/insights`).

Thin (SRP): parsea el request, arma el objeto de dominio, delega en el use case y
devuelve el DTO. El `user_id` sale del JWT (`extensions/security`); los errores de la
capa de aplicación se mapean a códigos HTTP (→ ProblemDetailDto en `main.py`).
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api.composition_root import (
    get_create_recurring_rule,
    get_create_savings_goal,
    get_create_space,
    get_get_daily_target,
    get_get_income_vs_expense,
    get_get_insights_metrics,
    get_get_spend_by_category,
    get_list_accounts,
    get_list_budgets,
    get_list_recent_transactions,
    get_list_recurring_rules,
    get_list_savings_goals,
    get_list_spaces,
    get_record_transaction,
    get_set_budget,
)
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.contexts.insights.application.daily_target import GetDailyTarget
from src.contexts.insights.application.dtos import (
    AccountResponse,
    BudgetResponse,
    ByCategoryReport,
    DailyTarget,
    IncomeVsExpenseReport,
    InsightsMetrics,
    MerchantDto,
    RecurringRuleResponse,
    SavingsGoalResponse,
    SpaceResponse,
    TransactionResponse,
)
from src.contexts.insights.application.queries import (
    ListAccounts,
    ListBudgets,
    ListRecentTransactions,
    ListRecurringRules,
    ListSavingsGoals,
    ListSpaces,
)
from src.contexts.insights.application.reports import (
    GetIncomeVsExpense,
    GetSpendByCategory,
)
from src.contexts.insights.domain.ledger import AccountType
from src.contexts.insights.application.errors import (
    AccountNotFoundError,
    CrossUserAccountError,
    TransactionCurrencyError,
)
from src.contexts.insights.application.metrics import GetInsightsMetrics
from src.contexts.insights.application.planning import (
    CreateRecurringRule,
    CreateSavingsGoal,
    CreateSpace,
    SetBudget,
)
from src.contexts.insights.application.transactions import RecordTransaction
from src.contexts.insights.domain.entities import (
    BudgetPeriod,
    Cadence,
    Merchant,
    Transaction,
    TransactionSource,
    TransactionType,
)
from src.shared.ids import new_id
from src.shared.money import Currency, Money

router = APIRouter(prefix="/insights", tags=["insights"])


@contextmanager
def _problem_details() -> Iterator[None]:
    """Mapea los errores de la capa de aplicación de Insights a códigos HTTP.

    `main.py` convierte la HTTPException resultante en ProblemDetailDto (RFC 7807-ish).
    """
    try:
        yield
    except AccountNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except CrossUserAccountError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except (TransactionCurrencyError, ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


class RecordTransactionRequest(BaseModel):
    """Cuerpo del POST /transactions. El monto va en *minor units* (nunca float · §12·B)."""

    type: TransactionType
    amount_minor: int
    currency: str
    account_id: str
    counter_account_id: str
    occurred_at: datetime
    source: TransactionSource = TransactionSource.MANUAL
    idempotency_key: str | None = None  # §12·C — reenvío del sync no duplica
    merchant: MerchantDto | None = None
    note: str | None = None
    essential: bool | None = None
    recurring: bool | None = None


@router.post(
    "/transactions",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un movimiento (write path del ledger)",
    description="Única vía válida de mover dinero (§5.2). Idempotente por idempotency_key (§12·C).",
    responses={
        401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"},
        403: {"model": ProblemDetailDto, "description": "Una cuenta es de otro usuario"},
        404: {"model": ProblemDetailDto, "description": "Cuenta inexistente"},
        422: {"model": ProblemDetailDto, "description": "Monto/moneda inválidos"},
    },
)
def record_transaction(
    body: RecordTransactionRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: RecordTransaction = Depends(get_record_transaction),
) -> TransactionResponse:
    with _problem_details():
        tx = Transaction(
            id=new_id(),
            user_id=user_id,
            type=body.type,
            amount=Money(body.amount_minor, Currency(body.currency)),
            account_id=body.account_id,
            counter_account_id=body.counter_account_id,
            occurred_at=body.occurred_at,
            source=body.source,
            idempotency_key=body.idempotency_key,
            merchant=(
                Merchant(body.merchant.name, body.merchant.logo_url)
                if body.merchant
                else None
            ),
            note=body.note,
            essential=body.essential,
            recurring=body.recurring,
        )
        result = use_case.execute(tx)
    return TransactionResponse.from_entity(result)


@router.get(
    "/metrics",
    response_model=InsightsMetrics,
    summary="Métricas de Insights (read path, derivadas del ledger)",
    description="Tarjetas de §5.3 por moneda (income/expenses/balance/total_balance/net_worth).",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def get_metrics(
    since: date = Query(description="Inicio del período (inclusive, ISO date)"),
    until: date = Query(description="Fin del período (inclusive, ISO date)"),
    user_id: str = Depends(get_current_user_id),
    use_case: GetInsightsMetrics = Depends(get_get_insights_metrics),
) -> InsightsMetrics:
    return use_case.execute(user_id, since, until)


@router.get(
    "/daily-target",
    response_model=DailyTarget,
    summary="Daily Target / You spent today (card ③, derivado de los budgets mensuales)",
    description="Cuánto puedes gastar por día sin pasarte del presupuesto del mes, por moneda.",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def get_daily_target(
    as_of: date | None = Query(
        default=None, description="Día de referencia (ISO date). Por defecto, hoy."
    ),
    user_id: str = Depends(get_current_user_id),
    use_case: GetDailyTarget = Depends(get_get_daily_target),
) -> DailyTarget:
    return use_case.execute(user_id, as_of or date.today())


# ── Read models (carrusel Home + listas del navbar) ──────────────────────────
_AUTH_ONLY = {401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}}


@router.get(
    "/accounts",
    response_model=list[AccountResponse],
    summary="Wallets del usuario con saldo (stack del Daily Diary)",
    description="Cuentas asset/liability con saldo derivado del ledger. Excluye categorías y equity.",
    responses=_AUTH_ONLY,
)
def list_accounts(
    user_id: str = Depends(get_current_user_id),
    use_case: ListAccounts = Depends(get_list_accounts),
) -> list[AccountResponse]:
    return use_case.execute(user_id)


@router.get(
    "/transactions",
    response_model=list[TransactionResponse],
    summary="Transacciones recientes (card ①)",
    description="Movimientos del usuario, más recientes primero. Búsqueda/filtros completos: pendiente.",
    responses=_AUTH_ONLY,
)
def list_transactions(
    limit: int = Query(default=20, ge=1, le=100, description="Máximo de movimientos a devolver"),
    user_id: str = Depends(get_current_user_id),
    use_case: ListRecentTransactions = Depends(get_list_recent_transactions),
) -> list[TransactionResponse]:
    return use_case.execute(user_id, limit)


@router.get(
    "/spaces",
    response_model=list[SpaceResponse],
    summary="Spaces del usuario (card ②)",
    responses=_AUTH_ONLY,
)
def list_spaces(
    user_id: str = Depends(get_current_user_id),
    use_case: ListSpaces = Depends(get_list_spaces),
) -> list[SpaceResponse]:
    return use_case.execute(user_id)


@router.get(
    "/budgets",
    response_model=list[BudgetResponse],
    summary="Presupuestos del usuario (navbar $)",
    responses=_AUTH_ONLY,
)
def list_budgets(
    user_id: str = Depends(get_current_user_id),
    use_case: ListBudgets = Depends(get_list_budgets),
) -> list[BudgetResponse]:
    return use_case.execute(user_id)


@router.get(
    "/savings-goals",
    response_model=list[SavingsGoalResponse],
    summary="Metas de ahorro del usuario (navbar ☆)",
    responses=_AUTH_ONLY,
)
def list_savings_goals(
    user_id: str = Depends(get_current_user_id),
    use_case: ListSavingsGoals = Depends(get_list_savings_goals),
) -> list[SavingsGoalResponse]:
    return use_case.execute(user_id)


@router.get(
    "/recurring-rules",
    response_model=list[RecurringRuleResponse],
    summary="Suscripciones / recurrentes del usuario (vista de suscripciones)",
    description="Lista las reglas recurrentes. Con due_by, solo las vencidas (bill reminders).",
    responses=_AUTH_ONLY,
)
def list_recurring_rules(
    due_by: date | None = Query(
        default=None, description="Si se da, solo reglas activas vencidas a esa fecha (ISO date)"
    ),
    user_id: str = Depends(get_current_user_id),
    use_case: ListRecurringRules = Depends(get_list_recurring_rules),
) -> list[RecurringRuleResponse]:
    return use_case.execute(user_id, due_by)


# ── Reports (🥧 gasto por categoría, ingresos vs gastos) ─────────────────────
@router.get(
    "/reports/by-category",
    response_model=ByCategoryReport,
    summary="Gasto (o ingreso) por categoría en el período — donut",
    responses=_AUTH_ONLY,
)
def report_by_category(
    since: date = Query(description="Inicio del período (inclusive, ISO date)"),
    until: date = Query(description="Fin del período (inclusive, ISO date)"),
    kind: Literal["expense", "income"] = Query(default="expense"),
    user_id: str = Depends(get_current_user_id),
    use_case: GetSpendByCategory = Depends(get_get_spend_by_category),
) -> ByCategoryReport:
    account_type = AccountType.INCOME if kind == "income" else AccountType.EXPENSE
    return use_case.execute(user_id, account_type, since, until)


@router.get(
    "/reports/income-vs-expense",
    response_model=IncomeVsExpenseReport,
    summary="Ingresos vs gastos por mes (breakdown mensual)",
    responses=_AUTH_ONLY,
)
def report_income_vs_expense(
    since: date = Query(description="Inicio del período (inclusive, ISO date)"),
    until: date = Query(description="Fin del período (inclusive, ISO date)"),
    user_id: str = Depends(get_current_user_id),
    use_case: GetIncomeVsExpense = Depends(get_get_income_vs_expense),
) -> IncomeVsExpenseReport:
    return use_case.execute(user_id, since, until)


# ── Planning creators (presupuestos, spaces, metas, recurrentes) ─────────────
_OWNERSHIP_RESPONSES = {
    401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"},
    403: {"model": ProblemDetailDto, "description": "Una cuenta referida es de otro usuario"},
    404: {"model": ProblemDetailDto, "description": "Cuenta referida inexistente"},
    422: {"model": ProblemDetailDto, "description": "Datos inválidos"},
}


class SetBudgetRequest(BaseModel):
    category_account_id: str
    limit_minor: int
    currency: str
    period: BudgetPeriod
    merchant_id: str | None = None
    alert_thresholds: list[int] | None = None  # default 70/85/100 lo pone el dominio


class CreateSpaceRequest(BaseModel):
    name: str
    account_ids: list[str] = []


class CreateSavingsGoalRequest(BaseModel):
    name: str
    target_minor: int
    currency: str
    account_id: str | None = None


class CreateRecurringRuleRequest(BaseModel):
    type: TransactionType
    amount_minor: int
    currency: str
    account_id: str
    counter_account_id: str
    cadence: Cadence
    next_run: date
    active: bool = True
    merchant: MerchantDto | None = None
    note: str | None = None


@router.post(
    "/budgets",
    response_model=BudgetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear/fijar un presupuesto por categoría o comercio",
    responses=_OWNERSHIP_RESPONSES,
)
def set_budget(
    body: SetBudgetRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: SetBudget = Depends(get_set_budget),
) -> BudgetResponse:
    extra = {} if body.alert_thresholds is None else {"alert_thresholds": body.alert_thresholds}
    with _problem_details():
        budget = use_case.execute(
            user_id=user_id,
            category_account_id=body.category_account_id,
            limit=Money(body.limit_minor, Currency(body.currency)),
            period=body.period,
            merchant_id=body.merchant_id,
            **extra,
        )
    return BudgetResponse.from_entity(budget)


@router.post(
    "/spaces",
    response_model=SpaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un space (sobre que agrupa cuentas)",
    responses=_OWNERSHIP_RESPONSES,
)
def create_space(
    body: CreateSpaceRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: CreateSpace = Depends(get_create_space),
) -> SpaceResponse:
    with _problem_details():
        space = use_case.execute(
            user_id=user_id, name=body.name, account_ids=body.account_ids
        )
    return SpaceResponse.from_entity(space)


@router.post(
    "/savings-goals",
    response_model=SavingsGoalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una meta de ahorro (alcancía)",
    responses=_OWNERSHIP_RESPONSES,
)
def create_savings_goal(
    body: CreateSavingsGoalRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: CreateSavingsGoal = Depends(get_create_savings_goal),
) -> SavingsGoalResponse:
    with _problem_details():
        goal = use_case.execute(
            user_id=user_id,
            name=body.name,
            target=Money(body.target_minor, Currency(body.currency)),
            account_id=body.account_id,
        )
    return SavingsGoalResponse.from_entity(goal)


@router.post(
    "/recurring-rules",
    response_model=RecurringRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una regla recurrente / suscripción",
    responses=_OWNERSHIP_RESPONSES,
)
def create_recurring_rule(
    body: CreateRecurringRuleRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: CreateRecurringRule = Depends(get_create_recurring_rule),
) -> RecurringRuleResponse:
    with _problem_details():
        rule = use_case.execute(
            user_id=user_id,
            type=body.type,
            amount=Money(body.amount_minor, Currency(body.currency)),
            account_id=body.account_id,
            counter_account_id=body.counter_account_id,
            cadence=body.cadence,
            next_run=body.next_run,
            active=body.active,
            merchant=(
                Merchant(body.merchant.name, body.merchant.logo_url)
                if body.merchant
                else None
            ),
            note=body.note,
        )
    return RecurringRuleResponse.from_entity(rule)

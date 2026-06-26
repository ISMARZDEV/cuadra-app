"""Tool de LECTURA del FinanceAgent: resumen financiero del mes.

Ejecuta de inmediato (es lectura, sin HITL) y devuelve cifras YA agregadas por Insights
(§7.3: las calcula SQL, no el LLM). El agente solo las redacta. `user_id` ligado por
closure (anti-IDOR §12.1). UoW propia de lectura.
"""
from __future__ import annotations

from datetime import date

from langchain_core.tools import tool

from src.contexts.insights.application.metrics import GetInsightsMetrics
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.shared.money import Currency, Money

from .transactions import SessionFactory


def _money(minor: int, currency: str) -> str:
    return Money(minor, Currency(currency)).format()  # decimales por moneda (no /100 fijo)


def build_get_monthly_summary(user_id: str, session_factory: SessionFactory):  # type: ignore[no-untyped-def]
    @tool
    def get_monthly_summary() -> str:
        """Resumen financiero del MES en curso del usuario: ingresos, gastos, balance neto,
        saldo total y ahorros, por moneda. Úsala para '¿cuánto llevo gastado?', '¿cómo voy
        este mes?', '¿cuál es mi balance?'."""
        today = date.today()
        with session_factory() as session:
            metrics = GetInsightsMetrics(SqlInsightsMetricsRepository(session)).execute(
                user_id, today.replace(day=1), today
            )
        # Datos NEUTRALES (etiquetas en inglés genérico) → no anclan el idioma; el agente
        # los redacta en el idioma del usuario (i18n: el LLM traduce, el dato es neutro).
        if not metrics.by_currency:
            return "no_data: the user has no movements this month"
        lines = []
        for b in metrics.by_currency:
            lines.append(
                f"[{b.currency}] income={_money(b.total_income_minor, b.currency)}, "
                f"expenses={_money(b.total_expenses_minor, b.currency)}, "
                f"net_balance={_money(b.balance_minor, b.currency)}, "
                f"total_balance={_money(b.total_balance_minor, b.currency)}, "
                f"savings={_money(b.savings_minor, b.currency)}"
            )
        return " · ".join(lines)

    return get_monthly_summary

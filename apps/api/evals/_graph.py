"""El grafo que usan los evals — UN solo sitio, a propósito.

Existe por un defecto real: `agent_perf.py` tenía su propia copia de la composición y se olvidó de
registrar el flujo de groceries. Consecuencia: «precio del aceite» stageaba su `pending_action` y
`hitl` caía al confirm+commit LEGACY — el harness medía un camino que en producción NO existe, y el
número salió mal sin que nada fallara.

Un eval que compone el grafo distinto que el composition root no mide el sistema: mide otro. Con un
solo builder, esa deriva no puede volver a pasar en silencio.
"""
from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver

from src.api.composition_root import SessionLocal
from src.contexts.aispace.agents.groceries.tools.catalog import compare_by_canonical_id
from src.contexts.aispace.flows.expense.categories import suggest_expense_categories
from src.contexts.aispace.flows.expense.flow import build_expense_flow
from src.contexts.aispace.flows.groceries.flow import build_groceries_flow
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.registry import build_registry
from src.contexts.aispace.orchestration.router import llm_classifier


def build_eval_graph():  # type: ignore[no-untyped-def]
    """Espeja `get_aispace_graph` del composition root. MemorySaver: se mide el GRAFO, no la
    persistencia."""
    registry = build_registry(SessionLocal)
    finance = registry["register_expense"]
    expense_flow = build_expense_flow(
        commit_action=lambda state, action: finance.commit({**state, "pending_action": action}),
        suggest_categories=suggest_expense_categories,
    )
    groceries_flow = build_groceries_flow(
        compare_by_id=lambda canonical_id: compare_by_canonical_id(
            SessionLocal, "DO", canonical_id
        )
    )
    return build_graph(
        MemorySaver(),
        classifier=llm_classifier,
        registry=registry,
        flow_registry={"register_expense": expense_flow, "groceries": groceries_flow},
    )

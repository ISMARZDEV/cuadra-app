"""Unit — mecánica del grafo del orquestador con agente FALSO (sin LLM, sin DB).

Prueba lo determinista: cortocircuito del router, ruteo registry-driven, y el HITL
(interrupt sobrevive la pausa; aprobar ejecuta, rechazar no). El comportamiento real del
LLM se prueba aparte (integration).
"""
from __future__ import annotations

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from src.contexts.aispace.orchestration.graph import build_graph


class FakeFinanceAgent:
    intents = ("register_expense",)

    def __init__(self) -> None:
        self.executed = False

    def plan(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "tool": "register_transaction",
            "args": {"amount": 500, "category": "Gasolina"},
            "summary": "registrar RD$500 en Gasolina",
            "requires_confirmation": True,
        }

    def execute(self, state) -> str:  # type: ignore[no-untyped-def]
        self.executed = True
        return "Registré RD$500 en Gasolina."


def _classifier_other(text: str, capabilities: list[str]) -> str:
    return "other"  # fuerza que el ruteo de gastos venga SOLO del cortocircuito


def _graph(agent):  # type: ignore[no-untyped-def]
    return build_graph(MemorySaver(), classifier=_classifier_other, registry={"register_expense": agent})


def _msg(text: str) -> dict:
    return {"messages": [HumanMessage(text)], "user_id": "u1", "capabilities": []}


def test_expense_shortcut_routes_and_pauses_on_hitl() -> None:
    agent = FakeFinanceAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "t1"}}
    out = graph.invoke(_msg("gasté 500 en gasolina"), cfg)  # cortocircuito (no LLM)

    assert "__interrupt__" in out                      # pausó en el HITL
    st = graph.get_state(cfg).values
    assert st["intent"] == "register_expense"
    assert st["pending_action"]["args"]["amount"] == 500
    assert agent.executed is False                     # aún no ejecutó


def test_hitl_approve_executes() -> None:
    agent = FakeFinanceAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "t2"}}
    graph.invoke(_msg("gasté 500 en gasolina"), cfg)
    graph.invoke(Command(resume="sí"), cfg)
    assert agent.executed is True


def test_hitl_reject_does_not_execute() -> None:
    agent = FakeFinanceAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "t3"}}
    graph.invoke(_msg("gasté 500 en gasolina"), cfg)
    graph.invoke(Command(resume="no"), cfg)
    assert agent.executed is False
    assert graph.get_state(cfg).values["pending_action"] is None  # se canceló


def test_non_finance_intent_responds_without_hitl() -> None:
    agent = FakeFinanceAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "t4"}}
    out = graph.invoke(_msg("hola, cómo estás"), cfg)  # sin monto → classifier "other"

    assert "__interrupt__" not in out
    assert agent.executed is False
    assert out["messages"][-1].content  # respondió algo

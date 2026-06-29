"""Unit — mecánica del grafo con agentes FALSOS (sin LLM, sin DB).

Prueba lo determinista: cortocircuito del router, ruteo registry-driven, HITL en ESCRITURAS
(stage → interrupt → aprobar commitea / rechazar no) y que las LECTURAS responden sin HITL.
El comportamiento real del LLM (create_agent) se prueba en integración.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from src.contexts.aispace.orchestration.graph import build_graph


class FakeWriteAgent:
    """run() stagea una escritura (como register_transaction)."""

    intents = ("register_expense", "query_metrics")

    def __init__(self) -> None:
        self.committed = False

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Preparé el registro, confírmalo.")],
            "pending_action": {
                "amount": 500, "category": "Gasolina",
                "summary": "registrar RD$500 en Gasolina", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        self.committed = True
        return "Registré RD$500 en Gasolina."


class FakeReadAgent:
    """run() responde de inmediato (lectura), sin pending_action."""

    intents = ("register_expense", "query_metrics")

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {"messages": [AIMessage("Llevas RD$1,200 gastados este mes.")], "pending_action": None}

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        raise AssertionError("una lectura no debe commitear")


class FakeGeneralAgent:
    """run() conversa de inmediato (sin escritura, sin HITL) — como el GeneralAgent real."""

    intents = ("general",)

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {"messages": [AIMessage("¡Hola! ¿Listo para cuidar tu plata? 🎉")], "pending_action": None}

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        return ""


def _classifier_other(text: str, capabilities: list[str]) -> str:
    return "other"


def _graph(agent):  # type: ignore[no-untyped-def]
    return build_graph(MemorySaver(), classifier=_classifier_other, registry={"register_expense": agent})


def _msg(text: str) -> dict:
    return {"messages": [HumanMessage(text)], "user_id": "u1", "capabilities": []}


def test_write_shortcut_routes_and_pauses_on_hitl() -> None:
    agent = FakeWriteAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "w1"}}
    out = graph.invoke(_msg("gasté 500 en gasolina"), cfg)  # cortocircuito → register_expense

    assert "__interrupt__" in out
    assert graph.get_state(cfg).values["pending_action"]["amount"] == 500
    assert agent.committed is False


def test_hitl_approve_commits() -> None:
    agent = FakeWriteAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "w2"}}
    graph.invoke(_msg("gasté 500 en gasolina"), cfg)
    graph.invoke(Command(resume="sí"), cfg)
    assert agent.committed is True


def test_hitl_reject_does_not_commit() -> None:
    agent = FakeWriteAgent()
    graph = _graph(agent)
    cfg = {"configurable": {"thread_id": "w3"}}
    graph.invoke(_msg("gasté 500 en gasolina"), cfg)
    graph.invoke(Command(resume="no"), cfg)
    assert agent.committed is False
    assert graph.get_state(cfg).values["pending_action"] is None


def test_read_responds_without_hitl() -> None:
    graph = build_graph(
        MemorySaver(), classifier=lambda t, c: "query_metrics",
        registry={"query_metrics": FakeReadAgent()},
    )
    cfg = {"configurable": {"thread_id": "r1"}}
    out = graph.invoke(_msg("cuánto llevo gastado este mes"), cfg)

    assert "__interrupt__" not in out                 # lectura: sin pausa
    assert "1,200" in out["messages"][-1].content      # respondió la lectura


def test_non_finance_intent_responds_canned() -> None:
    graph = _graph(FakeWriteAgent())
    cfg = {"configurable": {"thread_id": "o1"}}
    out = graph.invoke(_msg("hola, cómo estás"), cfg)
    assert "__interrupt__" not in out
    assert out["messages"][-1].content


def test_general_intent_routes_to_agent_not_canned() -> None:
    """Smalltalk → intent 'general' → el GeneralAgent CONVERSA (no el string fijo respond_other)."""
    graph = build_graph(
        MemorySaver(), classifier=lambda t, c: "general",
        registry={"general": FakeGeneralAgent()},
    )
    cfg = {"configurable": {"thread_id": "g1"}}
    out = graph.invoke(_msg("hola"), cfg)

    assert "__interrupt__" not in out                     # conversación: sin HITL
    assert "Hola" in out["messages"][-1].content          # respondió el agente, no t("other")

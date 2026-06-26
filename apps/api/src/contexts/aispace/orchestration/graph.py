"""Grafo del orquestador AISpace (§7.1, ruta única MVP). Registry-driven y testeable.

  classify_intent → (en registry?) ─ agent_plan → confirm(HITL) → agent_execute → END
                                   └ (no) ───────────────────────→ respond_other → END

`build_graph` recibe el `classifier` y el `registry` (intent→AgentSpec) inyectados → el
grafo NO conoce agentes concretos (escala: añadir agente = entrada en el registry, esto no
cambia). El `user_id` viaja en el estado (del JWT), nunca lo provee el LLM (anti-IDOR §12.1).
"""
from __future__ import annotations

from collections.abc import Mapping

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from src.contexts.aispace.agents.base import AgentSpec

from .router import Classifier, make_classify_intent
from .state import IAMState

_CANCEL = {"no", "n", "cancelar", "cancel"}


def build_graph(checkpointer, *, classifier: Classifier, registry: Mapping[str, AgentSpec]):  # type: ignore[no-untyped-def]
    def route_by_intent(state: dict) -> str:
        return "agent_plan" if state.get("intent") in registry else "respond_other"

    def agent_plan(state: dict) -> dict:
        return {"pending_action": registry[state["intent"]].plan(state)}

    def confirm(state: dict) -> dict:
        pa = state.get("pending_action")
        if not pa or not pa.get("requires_confirmation"):
            return {}
        answer = interrupt({"confirm": pa["summary"]})  # §7.4 — pausa hasta Command(resume=...)
        if str(answer).strip().lower() in _CANCEL:
            return {"pending_action": None}
        return {}

    def agent_execute(state: dict) -> dict:
        pa = state.get("pending_action")
        if pa is None:  # cancelado en el HITL
            return {"messages": [AIMessage("Cancelado, no registré nada.")]}
        reply = registry[state["intent"]].execute(state)
        return {"messages": [AIMessage(reply)], "pending_action": None}

    def respond_other(state: dict) -> dict:
        return {"messages": [AIMessage("(AISpace) Por ahora registro tus gastos. Pronto más.")]}

    g = StateGraph(IAMState)
    g.add_node("classify_intent", make_classify_intent(classifier))
    g.add_node("agent_plan", agent_plan)
    g.add_node("confirm", confirm)
    g.add_node("agent_execute", agent_execute)
    g.add_node("respond_other", respond_other)

    g.add_edge(START, "classify_intent")
    g.add_conditional_edges(
        "classify_intent", route_by_intent,
        {"agent_plan": "agent_plan", "respond_other": "respond_other"},
    )
    g.add_edge("agent_plan", "confirm")
    g.add_edge("confirm", "agent_execute")
    g.add_edge("agent_execute", END)
    g.add_edge("respond_other", END)
    return g.compile(checkpointer=checkpointer)

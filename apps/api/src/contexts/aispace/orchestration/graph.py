"""Grafo del orquestador AISpace (§7.1, ruta única MVP). Registry-driven y testeable.

  classify_intent → (en registry?) ─ agent_run → confirm(HITL) → agent_commit → END
                                   └ (no) ──────────────────────→ respond_other → END

`agent_run` corre el agente (ReAct): las LECTURAS ya responden ahí; las ESCRITURAS dejan un
`pending_action` staged → `confirm` pide confirmación (§7.4) → `agent_commit` la ejecuta.
`build_graph` recibe `classifier` y `registry` (intent→AgentSpec) → el grafo NO conoce
agentes concretos (escala: añadir agente = entrada en el registry). El `user_id` viaja en el
estado (del JWT), nunca lo provee el LLM (anti-IDOR §12.1).
"""
from __future__ import annotations

from collections.abc import Mapping

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from src.contexts.aispace.agents.base import AgentSpec
from src.shared.i18n import t

from .router import Classifier, make_classify_intent
from .state import AispaceState

_CANCEL = {"no", "n", "cancelar", "cancel", "não", "nao"}


def build_graph(checkpointer, *, classifier: Classifier, registry: Mapping[str, AgentSpec]):  # type: ignore[no-untyped-def]
    def route_by_intent(state: dict) -> str:
        return "agent_run" if state.get("intent") in registry else "respond_other"

    def agent_run(state: dict) -> dict:
        return registry[state["intent"]].run(state)  # → {messages, pending_action}

    def confirm(state: dict) -> dict:
        pa = state.get("pending_action")
        if not pa or not pa.get("requires_confirmation"):
            return {}  # lectura (ya respondió en run) → sigue sin HITL
        answer = interrupt({"confirm": pa["summary"]})  # §7.4 — pausa hasta Command(resume=...)
        if str(answer).strip().lower() in _CANCEL:
            msg = t("cancelled", state.get("language", "es"))
            return {"pending_action": None, "messages": [AIMessage(msg)]}
        return {}

    def agent_commit(state: dict) -> dict:
        pa = state.get("pending_action")
        if pa is None:  # lectura, o cancelado (ya respondido)
            return {}
        reply = registry[state["intent"]].commit(state)
        return {"messages": [AIMessage(reply)], "pending_action": None}

    def respond_other(state: dict) -> dict:
        return {"messages": [AIMessage(t("other", state.get("language", "es")))]}

    g = StateGraph(AispaceState)
    g.add_node("classify_intent", make_classify_intent(classifier))
    g.add_node("agent_run", agent_run)
    g.add_node("confirm", confirm)
    g.add_node("agent_commit", agent_commit)
    g.add_node("respond_other", respond_other)

    g.add_edge(START, "classify_intent")
    g.add_conditional_edges(
        "classify_intent", route_by_intent,
        {"agent_run": "agent_run", "respond_other": "respond_other"},
    )
    g.add_edge("agent_run", "confirm")
    g.add_edge("confirm", "agent_commit")
    g.add_edge("agent_commit", END)
    g.add_edge("respond_other", END)
    return g.compile(checkpointer=checkpointer)

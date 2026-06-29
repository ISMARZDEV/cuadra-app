"""Grafo del orquestador AISpace (§7.1, ruta única MVP). Registry-driven y testeable.

  classify_intent → (en registry?) ─ agent_run → hitl → END
                                   └ (no) ──────────→ respond_other → END

`agent_run` corre el agente (ReAct): las LECTURAS ya responden ahí; las ESCRITURAS dejan un
`pending_action` staged → `hitl` resuelve la confirmación (§7.4). Si el intent tiene un `FlowSpec`
en `flow_registry`, `hitl` corre el flujo MULTI-STEP (gasto: confirmar → ¿categoría? → sugerencias
→ commit + deep link, vía `drive_flow`); si no, cae al confirm+commit single-step (backward-compat).
`build_graph` recibe `classifier`, `registry` (intent→AgentSpec) y `flow_registry` (intent→FlowSpec)
→ el grafo NO conoce agentes ni flujos concretos (escala: añadir flujo = entrada en el registry). El
`user_id` viaja en el estado (del JWT), nunca lo provee el LLM (anti-IDOR §12.1).
"""
from __future__ import annotations

from collections.abc import Mapping

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from src.contexts.aispace.agents.base import AgentSpec
from src.contexts.aispace.flows.base import FlowSpec, Interaction, Option
from src.contexts.aispace.flows.driver import CANCEL_VALUES, drive_flow
from src.shared.i18n import t

from .router import Classifier, make_classify_intent
from .state import AispaceState


def build_graph(  # type: ignore[no-untyped-def]
    checkpointer,
    *,
    classifier: Classifier,
    registry: Mapping[str, AgentSpec],
    flow_registry: Mapping[str, FlowSpec] | None = None,
):
    flows = flow_registry or {}

    def route_by_intent(state: dict) -> str:
        return "agent_run" if state.get("intent") in registry else "respond_other"

    def agent_run(state: dict) -> dict:
        return registry[state["intent"]].run(state)  # → {messages, pending_action}

    def prepare_flow(state: dict) -> dict:
        # Corre EXACTAMENTE una vez (los resumes vuelven al nodo `hitl`, no a éste) → memoiza lo caro
        # que un step necesite (p. ej. sugerencias LLM de categoría) antes del loop de interrupts.
        pa = state.get("pending_action")
        if not pa or not pa.get("requires_confirmation"):
            return {}
        flow = flows.get(state["intent"])
        return flow.prepare(state) if (flow and flow.prepare) else {}

    def hitl(state: dict) -> dict:
        pa = state.get("pending_action")
        if not pa or not pa.get("requires_confirmation"):
            return {}  # lectura (ya respondió en run) → sigue sin HITL
        flow = flows.get(state["intent"])
        if flow is not None:
            return drive_flow(flow, state)  # multi-step (Img 8-11)
        # Legacy single-step confirm + commit (intents sin FlowSpec — backward-compat).
        lang = state.get("language", "es")
        interaction = Interaction(
            prompt=t("confirm_prompt", lang, summary=pa["summary"]),
            options=[
                Option("cancel", t("confirm.cancel", lang), "secondary"),
                Option("confirm", t("confirm.approve", lang), "primary"),
            ],
        )
        answer = interrupt(interaction.to_dict())  # §7.4 — pausa hasta Command(resume=...)
        if str(answer).strip().lower() in CANCEL_VALUES:
            return {"pending_action": None, "messages": [AIMessage(t("cancelled", lang))]}
        reply = registry[state["intent"]].commit(state)
        return {"messages": [AIMessage(reply)], "pending_action": None}

    def respond_other(state: dict) -> dict:
        return {"messages": [AIMessage(t("other", state.get("language", "es")))]}

    g = StateGraph(AispaceState)
    g.add_node("classify_intent", make_classify_intent(classifier))
    g.add_node("agent_run", agent_run)
    g.add_node("prepare_flow", prepare_flow)
    g.add_node("hitl", hitl)
    g.add_node("respond_other", respond_other)

    g.add_edge(START, "classify_intent")
    g.add_conditional_edges(
        "classify_intent", route_by_intent,
        {"agent_run": "agent_run", "respond_other": "respond_other"},
    )
    g.add_edge("agent_run", "prepare_flow")
    g.add_edge("prepare_flow", "hitl")
    g.add_edge("hitl", END)
    g.add_edge("respond_other", END)
    return g.compile(checkpointer=checkpointer)

"""Unit — traducción grafo → protocolo SSE/HTTP (slice 3), sin HTTP ni LLM (grafo real + fakes).

`stream_events` (para `/chat/stream`) y `chat_result` (para `/chat` y `/chat/resume`) emiten el
contrato genérico: frame `interaction` (desde el payload del interrupt) + frames `link` (desde
`ui_actions`). Escala a N flujos porque NO conoce el gasto: solo traduce interrupts y ui_actions.
"""
from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from src.contexts.aispace.flows.expense.flow import build_expense_flow
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.sse import chat_result, stream_events


class _WriteAgent:
    intents = ("register_expense",)

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Wow!!! 🫣 casi al límite.")],
            "pending_action": {
                "amount": 500, "currency": "USD", "category": None,
                "summary": "US$500 en Spotify", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]  # pragma: no cover
        return ""


def _build():  # type: ignore[no-untyped-def]
    def commit_action(state, action) -> str:  # type: ignore[no-untyped-def]
        return "Listo, tu gasto ha sido registrado ✅"

    flow = build_expense_flow(
        commit_action=commit_action,
        suggest_categories=lambda s: [{"value": "music", "icon": "🎵"}],
    )
    return build_graph(
        MemorySaver(),
        classifier=lambda t, c: "register_expense",
        registry={"register_expense": _WriteAgent()},
        flow_registry={"register_expense": flow},
    )


def _inputs() -> dict:
    return {"messages": [HumanMessage("gasté 500 en spotify")], "user_id": "u1",
            "capabilities": [], "language": "es"}


def _events(frames: list[str]) -> list[dict]:
    out: list[dict] = []
    for f in frames:
        line = f.strip()
        if line.startswith("data:"):
            out.append(json.loads(line[len("data:"):].strip()))
    return out


def test_stream_emits_coach_message_then_interaction_then_done() -> None:
    graph = _build()
    cfg = {"configurable": {"thread_id": "s1"}}
    evs = _events(list(stream_events(graph, _inputs(), cfg, "s1")))
    kinds = [e["type"] for e in evs]
    # The ReAct agent's coach reaction lives in state (not streamed) — it must still reach the chat,
    # EVEN though the confirm interaction follows it.
    assert any(e["type"] == "token" and "Wow" in e["content"] for e in evs)
    assert "interaction" in kinds
    inter = next(e for e in evs if e["type"] == "interaction")["interaction"]
    assert [o["value"] for o in inter["options"]] == ["cancel", "confirm"]
    assert evs[-1]["type"] == "done" and evs[-1]["thread_id"] == "s1"


def test_chat_result_returns_next_interaction_on_resume() -> None:
    graph = _build()
    cfg = {"configurable": {"thread_id": "s2"}}
    list(stream_events(graph, _inputs(), cfg, "s2"))      # → confirm
    graph.invoke(Command(resume="confirm"), cfg)          # → ¿categoría?
    res = chat_result(graph.get_state(cfg), "s2")
    assert res["interaction"] is not None
    assert [o["value"] for o in res["interaction"]["options"]] == ["none", "yes"]
    assert res["reply"] is None                            # paused: no final reply yet


def test_chat_result_returns_links_and_reply_on_commit() -> None:
    graph = _build()
    cfg = {"configurable": {"thread_id": "s3"}}
    list(stream_events(graph, _inputs(), cfg, "s3"))
    graph.invoke(Command(resume="confirm"), cfg)
    graph.invoke(Command(resume="yes"), cfg)
    graph.invoke(Command(resume="music"), cfg)            # commit
    res = chat_result(graph.get_state(cfg), "s3")
    assert res["interaction"] is None
    assert "registrado" in res["reply"]
    assert any(link["href"] == "insights" for link in res["links"])

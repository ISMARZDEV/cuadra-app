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
from src.contexts.aispace.orchestration.sse import (
    chat_result,
    sse_frame,
    stream_events,
    ui_action_frames,
)


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


class TestElCanalDeUiActionsEsGENERICO:
    """El módulo declara «no sabe de gastos, sólo de interrupts + ui_actions». Que lo cumpla.

    La tarjeta de producto de Save entró sin que `sse.py` aprendiera qué es un producto: cada
    `ui_action` viaja como su propio frame. Si en vez de eso hubiera que agregar un `if` por cada
    tipo nuevo, el módulo dejaría de ser genérico y cada feature tocaría el transporte.
    """

    def test_a_link_action_still_arrives_exactly_as_before(self) -> None:
        # Contrato viejo intacto: el cliente que ya lee `link` no se entera del cambio.
        [frame] = _events(
            [sse_frame(a) for a in ui_action_frames({"ui_actions": [
                {"type": "link", "text": "Ver en Insight", "href": "insights"}
            ]})]
        )

        assert frame == {"type": "link", "text": "Ver en Insight", "href": "insights"}

    def test_an_unknown_action_type_travels_without_sse_knowing_it(self) -> None:
        card = {"type": "product", "name": "Café", "stores": [{"provider": "Sirena"}]}

        [frame] = _events([sse_frame(a) for a in ui_action_frames({"ui_actions": [card]})])

        assert frame == card

    def test_an_action_without_a_type_is_dropped(self) -> None:
        # Un frame sin `type` rompería el switch del cliente: no se emite.
        assert ui_action_frames({"ui_actions": [{"text": "huérfano"}]}) == []

    def test_chat_result_carries_the_SAME_actions_as_the_stream(self) -> None:
        """Los DOS caminos tienen que entregar lo mismo, y este test nace de un fallo real.

        `stream_events` se hizo genérico pero `chat_result` —el body de `/chat/resume`— siguió
        filtrando `type == "link"`. Consecuencia medida en el device: el usuario elegía un arroz en
        el dock, el agente contestaba «Acá está Arroz Pimco Premium 10 Lbs:» y la TARJETA
        DESAPARECÍA en silencio, porque su `type` era `product` y ese filtro la tiraba.

        Es el mismo defecto que este canal vino a resolver, un escalón más abajo: dos caminos con
        contratos distintos para una sola cosa.
        """

        class _Snapshot:
            tasks: tuple = ()
            values = {
                "messages": [AIMessage("Acá está Arroz Pimco Premium 10 Lbs:")],
                "ui_actions": [
                    {"type": "product", "name": "Arroz Pimco Premium 10 Lbs", "stores": []},
                    {"type": "link", "text": "Ver en Insight", "href": "insights"},
                ],
            }

        res = chat_result(_Snapshot(), "t1")

        assert [a["type"] for a in res["ui_actions"]] == ["product", "link"]
        # `links` sobrevive para los clientes que ya lo leen; NO se rompe nada al agregar el campo.
        assert [link["href"] for link in res["links"]] == ["insights"]


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


# ── Streaming del agente ReAct: la allowlist va por NAMESPACE, no por nombre de nodo ──
#
# MEDIDO 2026-08-02 contra el grafo real con LLM real:
#   ns=()                        node='classify_intent'  → 12 chunks, 6 CON TEXTO  ← debe callarse
#   ns=('agent_run:<uuid>',)     node='model'            → 33 chunks, 24 con texto ← debe salir
#   ns=('agent_run:<uuid>',)     node='tools'            → 1 chunk,  0 con texto
#
# Sin `subgraphs=True` el agente ReAct emite CERO chunks (grafo anidado). Con él, sus chunks
# llevan el nombre del nodo INTERNO (`model`), así que filtrar por `langgraph_node == "agent_run"`
# los tiraba a la basura. Filtrar por namespace resuelve las dos cosas a la vez.

class _FakeChunk:
    """AIMessageChunk mínimo — evita construir un grafo con LLM real en un unit test."""

    def __init__(self, content: str) -> None:
        self.content = content


class _FakeGraph:
    """Grafo fake que emite la MISMA forma que `stream(..., subgraphs=True)`."""

    def __init__(self, items) -> None:  # type: ignore[no-untyped-def]
        self._items = items

    def stream(self, inputs, cfg, stream_mode=None, subgraphs=False):  # type: ignore[no-untyped-def]
        assert subgraphs is True, "sin subgraphs=True los tokens del ReAct no afloran"
        yield from self._items

    def get_state(self, cfg):  # type: ignore[no-untyped-def]
        class _S:
            tasks: tuple = ()
            values: dict = {"messages": [AIMessage("respuesta final")], "ui_actions": []}

        return _S()


def _tokens(frames) -> list[str]:  # type: ignore[no-untyped-def]
    return [e["content"] for e in _events(list(frames)) if e["type"] == "token"]


def test_the_react_agents_nested_tokens_DO_reach_the_chat() -> None:
    from langchain_core.messages import AIMessageChunk

    graph = _FakeGraph(
        [
            (("agent_run:abc123",), (AIMessageChunk(content="El arroz "), {"langgraph_node": "model"})),
            (("agent_run:abc123",), (AIMessageChunk(content="está en Bravo."), {"langgraph_node": "model"})),
        ]
    )

    assert _tokens(stream_events(graph, {}, {}, "t")) == ["El arroz ", "está en Bravo."]


def test_the_classifier_still_never_leaks_into_the_chat() -> None:
    """El clasificador EMITE texto (6 chunks medidos: el JSON del structured output)."""
    from langchain_core.messages import AIMessageChunk

    graph = _FakeGraph(
        [
            ((), (AIMessageChunk(content='{"intent":'), {"langgraph_node": "classify_intent"})),
            ((), (AIMessageChunk(content='"groceries"}'), {"langgraph_node": "classify_intent"})),
        ]
    )

    assert _tokens(stream_events(graph, {}, {}, "t")) == ["respuesta final"]  # solo el fallback


def test_an_internal_flow_llm_never_leaks_either() -> None:
    from langchain_core.messages import AIMessageChunk

    graph = _FakeGraph(
        [((), (AIMessageChunk(content='{"items":['), {"langgraph_node": "prepare_flow"}))]
    )

    assert _tokens(stream_events(graph, {}, {}, "t")) == ["respuesta final"]


def test_a_non_react_agent_in_the_node_itself_still_streams() -> None:
    """El GeneralAgent corre el LLM DENTRO del nodo: ns vacío + node `agent_run`."""
    from langchain_core.messages import AIMessageChunk

    graph = _FakeGraph(
        [((), (AIMessageChunk(content="¡Hola!"), {"langgraph_node": "agent_run"}))]
    )

    assert _tokens(stream_events(graph, {}, {}, "t")) == ["¡Hola!"]

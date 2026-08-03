"""Translate a graph run into the AISpace wire protocol (§7.6) — pure and dependency-light so it's
unit-testable without the HTTP stack or an LLM.

Two entry points, ONE generic contract (scales to any flow — this module knows nothing about
expenses, only interrupts + ui_actions):
  - `stream_events` → SSE frames for `POST /chat/stream` (the first turn): `token`* → `interaction`?
    → one frame per `ui_action` (`link`, `product`, …) → `done`.
  - `chat_result` → the JSON body for `POST /chat` and `POST /chat/resume`: the next `interaction`
    (if the graph paused) or the final `reply`, plus any `links`.

Frame/field types:
  token        {type, content}          assistant text chunk
  interaction  {type, interaction}      the graph paused at interrupt() → {prompt, options[]}
  link         {type, text, href}       a ui_actions deep link (e.g. "Ver en Insight" → insights)
  product      {type, name, stores[]}    Save's in-chat comparison card (see `ui_action_frames`)
  done         {type, thread_id}        terminal
"""
from __future__ import annotations

import json
from collections.abc import Iterator

from langchain_core.messages import AIMessageChunk


_AGENT_NODE = "agent_run"


def _is_user_facing(namespace: tuple, meta: dict) -> bool:  # type: ignore[type-arg]
    """¿Este chunk es texto del agente que habla con el usuario?

    Dos formas legítimas, medidas contra el grafo real:
      - **anidada** — un agente ReAct corre en su propio subgrafo: `ns=('agent_run:<uuid>',)`,
        con el nombre del nodo INTERNO (`model`).
      - **directa** — un agente que llama al LLM dentro del nodo (GeneralAgent): `ns=()` y
        `langgraph_node == 'agent_run'`.

    Todo lo demás es maquinaria interna (el clasificador, los LLM de un flow) y se calla.
    """
    if namespace:
        return str(namespace[0]).split(":", 1)[0] == _AGENT_NODE
    return meta.get("langgraph_node") == _AGENT_NODE


def sse_frame(payload: dict) -> str:
    """One SSE frame: `data: {json}\\n\\n` (UTF-8, no ASCII-escaping for es/pt)."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def pending_interaction(snapshot) -> dict | None:  # type: ignore[no-untyped-def]
    """The Interaction payload of the active interrupt, or None if the graph isn't paused."""
    for task in snapshot.tasks:
        for intr in getattr(task, "interrupts", ()):
            return dict(intr.value)
    return None


def links(state: dict) -> list[dict]:
    """Deep-link ui_actions emitted by a flow's commit (e.g. {type:link, text, href})."""
    return [a for a in state.get("ui_actions", []) if a.get("type") == "link"]


def ui_action_frames(state: dict) -> list[dict]:
    """Every `ui_action` as its own frame, whatever its type.

    Generic ON PURPOSE, and it is what lets this module keep the promise in its docstring. Save's
    product card shipped without `sse.py` learning what a product is: a ui_action already has the
    frame shape (`{"type": …, …}`), so it travels verbatim. The alternative — an `if` per new type —
    would make every feature touch the transport.

    An action without a `type` is dropped: it would break the client's switch.
    """
    return [a for a in state.get("ui_actions", []) if a.get("type")]


def chat_result(snapshot, thread_id: str) -> dict:  # type: ignore[no-untyped-def]
    """Body for the non-streaming endpoints: the next interaction (paused) OR the final reply."""
    state = snapshot.values
    interaction = pending_interaction(snapshot)
    messages = state.get("messages", [])
    reply = None if interaction else (messages[-1].content if messages else None)
    return {
        "thread_id": thread_id,
        "reply": reply,
        "interaction": interaction,
        # `links` se mantiene para los clientes que ya lo leen; `ui_actions` es el canal completo.
        # Tenerlo SOLO en el stream fue un bug real: al elegir en el dock, la respuesta viaja por
        # `/chat/resume` (o sea por acá), y la tarjeta de producto desaparecía en silencio porque
        # su `type` no era `link`. Los dos caminos deben entregar lo MISMO.
        "links": links(state),
        "ui_actions": ui_action_frames(state),
    }


def stream_events(graph, inputs: dict, cfg: dict, thread_id: str) -> Iterator[str]:  # type: ignore[no-untyped-def]
    """Drive the graph and translate it into SSE frames (see module docstring)."""
    emitted = False
    # `subgraphs=True` is REQUIRED, not an optimization. A ReAct agent (`create_agent`) runs a
    # NESTED graph, and without this flag its tokens emit **zero** chunks here — the chat stays
    # mute and then prints the whole reply at once. Measured 2026-08-02 on the real graph:
    #   subgraphs off → 0 chunks · subgraphs on → 22-33 chunks, first one at ~1.6s.
    for namespace, (chunk, meta) in graph.stream(
        inputs, cfg, stream_mode="messages", subgraphs=True
    ):
        # The allowlist is on the NAMESPACE, not on `langgraph_node`, because a nested chunk
        # carries the INNER node's name (`model`, `tools`) — filtering by `agent_run` threw exactly
        # the tokens we want away. What must stay silent still does: the classifier DOES emit text
        # (measured: 6 chunks of `{"intent":…}`) and the flow's internal LLMs too, and both run at
        # the ROOT namespace under their own node.
        if not _is_user_facing(namespace, meta):
            continue
        if isinstance(chunk, AIMessageChunk) and chunk.content:
            emitted = True
            yield sse_frame({"type": "token", "content": chunk.content})

    snapshot = graph.get_state(cfg)
    state = snapshot.values
    interaction = pending_interaction(snapshot)

    # Emit the latest assistant message when nothing streamed. ReAct agents (FinanceAgent via
    # create_agent) run a NESTED graph whose LLM tokens do NOT surface in this stream_mode="messages"
    # loop; deterministic nodes (respond_other, flow commit) don't stream either. So the reply (e.g.
    # the coach reaction) only lives in state — emit it here. Crucially do this EVEN when an
    # interaction follows (the confirm step), or the coach message would be swallowed by the dock.
    if not emitted:
        messages = state.get("messages", [])
        content = messages[-1].content if messages else None
        if content:
            yield sse_frame({"type": "token", "content": content})

    if interaction:
        yield sse_frame({"type": "interaction", "interaction": interaction})

    for action in ui_action_frames(state):
        yield sse_frame(action)

    yield sse_frame({"type": "done", "thread_id": thread_id})

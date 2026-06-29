"""Translate a graph run into the AISpace wire protocol (§7.6) — pure and dependency-light so it's
unit-testable without the HTTP stack or an LLM.

Two entry points, ONE generic contract (scales to any flow — this module knows nothing about
expenses, only interrupts + ui_actions):
  - `stream_events` → SSE frames for `POST /chat/stream` (the first turn): `token`* → `interaction`?
    → `link`* → `done`.
  - `chat_result` → the JSON body for `POST /chat` and `POST /chat/resume`: the next `interaction`
    (if the graph paused) or the final `reply`, plus any `links`.

Frame/field types:
  token        {type, content}          assistant text chunk
  interaction  {type, interaction}      the graph paused at interrupt() → {prompt, options[]}
  link         {type, text, href}       a ui_actions deep link (e.g. "Ver en Insight" → insights)
  done         {type, thread_id}        terminal
"""
from __future__ import annotations

import json
from collections.abc import Iterator

from langchain_core.messages import AIMessageChunk


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
        "links": links(state),
    }


def stream_events(graph, inputs: dict, cfg: dict, thread_id: str) -> Iterator[str]:  # type: ignore[no-untyped-def]
    """Drive the graph and translate it into SSE frames (see module docstring)."""
    emitted = False
    for chunk, meta in graph.stream(inputs, cfg, stream_mode="messages"):
        # stream_mode="messages" yields token chunks from EVERY LLM in the graph. Only the
        # user-facing agent (`agent_run`) should reach the chat — the classifier (`classify_intent`,
        # e.g. `{"intent":"other"}`) AND the flow's internal LLMs (`prepare_flow`, the category
        # suggestion `{"items":[…]}`) must NOT leak. Allowlist agent_run; everything else is internal.
        if meta.get("langgraph_node") != "agent_run":
            continue
        if isinstance(chunk, AIMessageChunk) and chunk.content:
            emitted = True
            yield sse_frame({"type": "token", "content": chunk.content})

    snapshot = graph.get_state(cfg)
    state = snapshot.values
    interaction = pending_interaction(snapshot)
    if interaction:
        yield sse_frame({"type": "interaction", "interaction": interaction})
    elif not emitted:
        # Deterministic nodes (respond_other, flow commit) don't stream token chunks — fall back to
        # the final assistant message so the client still renders a reply.
        messages = state.get("messages", [])
        content = messages[-1].content if messages else None
        if content:
            yield sse_frame({"type": "token", "content": content})

    for link in links(state):
        yield sse_frame({"type": "link", "text": link["text"], "href": link["href"]})

    yield sse_frame({"type": "done", "thread_id": thread_id})

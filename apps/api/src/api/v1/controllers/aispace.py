"""AISpace controller — HTTP boundary del chat IA (prefijo `/aispace`).

Thin: arma el estado inicial (user_id del JWT), invoca el grafo y mapea el resultado. El
HITL (§7.4) cruza DOS requests: `POST /chat` deja `pending_action` (grafo pausado en el
interrupt); `POST /chat/resume` lo aprueba/cancela. El `thread_id` liga la conversación.
"""
from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.api.composition_root import get_aispace_graph
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.shared.i18n import t
from src.shared.ids import new_id
from src.shared.lang import resolve_language

router = APIRouter(prefix="/aispace", tags=["aispace"])


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # null = nueva conversación
    locale: str | None = None     # locale del cliente (señal primaria de idioma · i18n)


class ResumeRequest(BaseModel):
    thread_id: str
    approved: bool


class ChatResponse(BaseModel):
    thread_id: str
    reply: str | None = None
    pending_action: dict | None = None  # != null → grafo pausado esperando confirmación


def _respond(thread_id: str, result: dict, graph, cfg: dict) -> ChatResponse:  # type: ignore[no-untyped-def]
    state = graph.get_state(cfg).values
    pending = state.get("pending_action") if "__interrupt__" in result else None
    if pending:
        reply = t("confirm_prompt", state.get("language", "es"), summary=pending["summary"])
    else:
        messages = state.get("messages", [])
        reply = messages[-1].content if messages else None
    return ChatResponse(thread_id=thread_id, reply=reply, pending_action=pending)


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Enviar un mensaje al chat IA (router → agente → HITL)",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    graph=Depends(get_aispace_graph),  # type: ignore[no-untyped-def]
) -> ChatResponse:
    thread_id = body.thread_id or new_id()
    cfg = {"configurable": {"thread_id": thread_id}}
    language = resolve_language(body.message, body.locale)  # cliente primario + override
    result = graph.invoke(
        {
            "messages": [HumanMessage(body.message)],
            "user_id": user_id,
            "capabilities": [],
            "language": language,
        },
        cfg,
    )
    return _respond(thread_id, result, graph, cfg)


def _sse(payload: dict) -> str:
    """One SSE frame: `data: {json}\\n\\n` (UTF-8, no ASCII-escaping for es/pt)."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stream_events(graph, inputs: dict, cfg: dict, thread_id: str) -> Iterator[str]:  # type: ignore[no-untyped-def]
    """Drive the graph and translate it into the SSE event protocol (§7.6):
      token   — each assistant token chunk (real agents stream via the LLM)
      pending — the graph paused at an interrupt() with an action to confirm (HITL §7.4)
      done    — terminal frame carrying the thread_id (so the client can resume/continue)
    """
    emitted = False
    for chunk, _meta in graph.stream(inputs, cfg, stream_mode="messages"):
        if isinstance(chunk, AIMessageChunk) and chunk.content:
            emitted = True
            yield _sse({"type": "token", "content": chunk.content})

    state = graph.get_state(cfg).values
    pending = state.get("pending_action")
    if pending and pending.get("requires_confirmation"):
        yield _sse({"type": "pending", "action": pending})
    elif not emitted:
        # Non-LLM nodes (respond_other, deterministic agents) don't stream token chunks —
        # fall back to the final assistant message so the client still renders a reply.
        messages = state.get("messages", [])
        content = messages[-1].content if messages else None
        if content:
            yield _sse({"type": "token", "content": content})

    yield _sse({"type": "done", "thread_id": thread_id})


@router.post(
    "/chat/stream",
    summary="Enviar un mensaje al chat IA con streaming de tokens (SSE · §7.6)",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def chat_stream(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    graph=Depends(get_aispace_graph),  # type: ignore[no-untyped-def]
) -> StreamingResponse:
    thread_id = body.thread_id or new_id()
    cfg = {"configurable": {"thread_id": thread_id}}
    language = resolve_language(body.message, body.locale)  # cliente primario + override
    inputs = {
        "messages": [HumanMessage(body.message)],
        "user_id": user_id,
        "capabilities": [],
        "language": language,
    }
    return StreamingResponse(
        _stream_events(graph, inputs, cfg, thread_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/chat/resume",
    response_model=ChatResponse,
    summary="Confirmar o cancelar la acción pendiente (HITL §7.4)",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def resume(
    body: ResumeRequest,
    user_id: str = Depends(get_current_user_id),
    graph=Depends(get_aispace_graph),  # type: ignore[no-untyped-def]
) -> ChatResponse:
    cfg = {"configurable": {"thread_id": body.thread_id}}
    result = graph.invoke(Command(resume="sí" if body.approved else "no"), cfg)
    return _respond(body.thread_id, result, graph, cfg)

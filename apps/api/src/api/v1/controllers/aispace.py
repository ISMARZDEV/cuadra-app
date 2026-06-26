"""AISpace controller — HTTP boundary del chat IA (prefijo `/aispace`).

Thin: arma el estado inicial (user_id del JWT), invoca el grafo y mapea el resultado. El
HITL (§7.4) cruza DOS requests: `POST /chat` deja `pending_action` (grafo pausado en el
interrupt); `POST /chat/resume` lo aprueba/cancela. El `thread_id` liga la conversación.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.api.composition_root import get_aispace_graph
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.shared.ids import new_id

router = APIRouter(prefix="/aispace", tags=["aispace"])


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # null = nueva conversación


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
        reply = f"¿Confirmas {pending['summary']}? (sí/no)"
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
    result = graph.invoke(
        {"messages": [HumanMessage(body.message)], "user_id": user_id, "capabilities": []},
        cfg,
    )
    return _respond(thread_id, result, graph, cfg)


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

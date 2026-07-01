"""AISpace controller — HTTP boundary del chat IA (prefijo `/aispace`).

Thin: arma el estado inicial (user_id del JWT), invoca el grafo y mapea el resultado. El
HITL (§7.4) cruza DOS requests: `POST /chat` deja `pending_action` (grafo pausado en el
interrupt); `POST /chat/resume` lo aprueba/cancela. El `thread_id` liga la conversación.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.api.composition_root import get_aispace_graph, get_preference_repository
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.contexts.aispace.orchestration.sse import chat_result, stream_events
from src.contexts.aispace.preferences.enums import Personality
from src.contexts.aispace.preferences.ports import PreferenceRepository
from src.shared.ids import new_id
from src.shared.lang import client_language, resolve_language

router = APIRouter(prefix="/aispace", tags=["aispace"])


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # null = nueva conversación
    locale: str | None = None     # locale del cliente (señal primaria de idioma · i18n)


class ResumeRequest(BaseModel):
    thread_id: str
    value: str | None = None    # opción elegida en un paso HITL ("confirm"/"yes"/"music"/"none"…)
    approved: bool | None = None  # DEPRECATED — legacy sí/no (mapea a value para back-compat)


class PersonalityResponse(BaseModel):
    personality: Personality       # tono actual del copiloto (neutral/coach/roast)


class UpdatePersonalityRequest(BaseModel):
    personality: Personality       # set cerrado → un valor inválido da 422 automáticamente


class ChatResponse(BaseModel):
    thread_id: str
    reply: str | None = None
    interaction: dict | None = None     # próximo paso HITL multi-step → {prompt, options[]}
    links: list[dict] = []              # deep links que dejó el flow (p. ej. "Ver en Insight")
    pending_action: dict | None = None  # DEPRECATED — back-compat; != null → grafo pausado


def _respond(thread_id: str, graph, cfg: dict) -> ChatResponse:  # type: ignore[no-untyped-def]
    snapshot = graph.get_state(cfg)
    res = chat_result(snapshot, thread_id)
    # reply: la respuesta final, o el prompt del paso pendiente (para clientes que aún no leen
    # `interaction`). pending_action se mantiene mientras el grafo esté pausado (back-compat).
    reply = res["reply"] or (res["interaction"]["prompt"] if res["interaction"] else None)
    pending = snapshot.values.get("pending_action") if res["interaction"] else None
    return ChatResponse(
        thread_id=thread_id, reply=reply,
        interaction=res["interaction"], links=res["links"], pending_action=pending,
    )


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
    prefs: PreferenceRepository = Depends(get_preference_repository),
) -> ChatResponse:
    thread_id = body.thread_id or new_id()
    cfg = {"configurable": {"thread_id": thread_id}}
    language = resolve_language(body.message, body.locale)  # cliente primario + override
    graph.invoke(
        {
            "messages": [HumanMessage(body.message)],
            "user_id": user_id,
            "capabilities": [],
            "language": language,
            "ui_language": client_language(body.locale),  # workflow chrome — nunca override
            "personality": prefs.get_personality(user_id).value,  # tono del GeneralAgent
            "ui_actions": [],  # reset per turn → links don't carry over to later messages
        },
        cfg,
    )
    return _respond(thread_id, graph, cfg)


@router.post(
    "/chat/stream",
    summary="Enviar un mensaje al chat IA con streaming de tokens (SSE · §7.6)",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def chat_stream(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    graph=Depends(get_aispace_graph),  # type: ignore[no-untyped-def]
    prefs: PreferenceRepository = Depends(get_preference_repository),
) -> StreamingResponse:
    thread_id = body.thread_id or new_id()
    cfg = {"configurable": {"thread_id": thread_id}}
    language = resolve_language(body.message, body.locale)  # cliente primario + override
    inputs = {
        "messages": [HumanMessage(body.message)],
        "user_id": user_id,
        "capabilities": [],
        "language": language,
        "ui_language": client_language(body.locale),  # workflow chrome — nunca override
        "personality": prefs.get_personality(user_id).value,  # tono del GeneralAgent
        "ui_actions": [],  # reset per turn → links don't carry over to later messages
    }
    return StreamingResponse(
        stream_events(graph, inputs, cfg, thread_id),
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
    # Multi-step flows send the chosen option `value`; legacy clients send `approved` (sí/no).
    resume_value = body.value if body.value is not None else ("sí" if body.approved else "no")
    graph.invoke(Command(resume=resume_value), cfg)
    return _respond(body.thread_id, graph, cfg)


@router.get(
    "/preferences",
    response_model=PersonalityResponse,
    summary="Personalidad actual del copiloto (default COACH si no se eligió)",
    responses={401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"}},
)
def get_preferences(
    user_id: str = Depends(get_current_user_id),
    prefs: PreferenceRepository = Depends(get_preference_repository),
) -> PersonalityResponse:
    return PersonalityResponse(personality=prefs.get_personality(user_id))


@router.put(
    "/preferences",
    response_model=PersonalityResponse,
    summary="Elegir la personalidad del copiloto (neutral/coach/roast)",
    responses={
        401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"},
        422: {"model": ProblemDetailDto, "description": "Personalidad inválida"},
    },
)
def put_preferences(
    body: UpdatePersonalityRequest,
    user_id: str = Depends(get_current_user_id),
    prefs: PreferenceRepository = Depends(get_preference_repository),
) -> PersonalityResponse:
    prefs.set_personality(user_id, body.personality)
    return PersonalityResponse(personality=body.personality)

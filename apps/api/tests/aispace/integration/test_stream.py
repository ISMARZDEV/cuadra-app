"""Integration — endpoint SSE `/v1/aispace/chat/stream` (§7.6, streaming de tokens).

Grafo inyectado por override (MemorySaver + agentes stub deterministas, sin LLM). Verifica el
PROTOCOLO de eventos SSE (líneas `data:` JSON):
  - lectura  → `token`(s) con el reply + `done`(thread_id).
  - escritura → `pending`(action, HITL §7.4) + `done` — el grafo pausa en el interrupt.
  - sin token → 401 si falta el JWT.
"""
from __future__ import annotations

import json
import uuid

import jwt
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver

from src.api.composition_root import get_aispace_graph
from src.config import settings
from src.contexts.aispace.orchestration.graph import build_graph
from src.main import app


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


def _events(text: str) -> list[dict]:
    """Parse SSE body → list of JSON event dicts (one per `data:` block)."""
    out: list[dict] = []
    for block in text.strip().split("\n\n"):
        line = block.strip()
        if line.startswith("data:"):
            out.append(json.loads(line[len("data:") :].strip()))
    return out


class _WriteAgent:
    """Escritura: run() stagea un pending_action (a confirmar); commit() lo ejecuta."""

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Preparé el registro, confírmalo.")],
            "pending_action": {
                "amount": 500, "category": "Gasolina", "merchant": None,
                "summary": "registrar RD$500 en Gasolina", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        return "Listo, registré RD$500 en Gasolina."


class _ReadAgent:
    """Lectura: responde directo, sin pending_action (no HITL)."""

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {"messages": [AIMessage("Tu balance es RD$1,200.")], "pending_action": None}

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]  # pragma: no cover
        return ""


def _graph(classifier):  # type: ignore[no-untyped-def]
    registry = {"register_expense": _WriteAgent(), "query_metrics": _ReadAgent()}
    return build_graph(MemorySaver(), classifier=classifier, registry=registry)


def test_stream_write_emits_pending_then_done() -> None:
    user_id = str(uuid.uuid4())
    graph = _graph(lambda t, c: "other")  # "gasté…" cae en el cortocircuito → register_expense
    app.dependency_overrides[get_aispace_graph] = lambda: graph
    try:
        res = TestClient(app).post(
            "/v1/aispace/chat/stream",
            json={"message": "gasté 500 en gasolina"},
            headers=_bearer(user_id),
        )
        assert res.status_code == 200, res.text
        assert res.headers["content-type"].startswith("text/event-stream")
        evs = _events(res.text)
        kinds = [e["type"] for e in evs]
        assert "pending" in kinds
        pending = next(e for e in evs if e["type"] == "pending")
        assert pending["action"]["summary"] == "registrar RD$500 en Gasolina"
        assert pending["action"]["requires_confirmation"] is True
        done = next(e for e in evs if e["type"] == "done")
        assert done["thread_id"]
    finally:
        app.dependency_overrides.clear()


def test_stream_read_emits_reply_then_done() -> None:
    user_id = str(uuid.uuid4())
    graph = _graph(lambda t, c: "query_metrics")  # sin cortocircuito → usa el classifier
    app.dependency_overrides[get_aispace_graph] = lambda: graph
    try:
        res = TestClient(app).post(
            "/v1/aispace/chat/stream",
            json={"message": "cuál es mi balance"},
            headers=_bearer(user_id),
        )
        assert res.status_code == 200, res.text
        evs = _events(res.text)
        text = "".join(e.get("content", "") for e in evs if e["type"] == "token")
        assert "1,200" in text
        assert evs[-1]["type"] == "done"
        assert evs[-1]["thread_id"]
    finally:
        app.dependency_overrides.clear()


def test_stream_without_token_is_401() -> None:
    res = TestClient(app).post("/v1/aispace/chat/stream", json={"message": "hola"})
    assert res.status_code == 401

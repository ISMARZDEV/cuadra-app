"""Integration — endpoints /v1/aispace/chat (+ /resume) de punta a punta (HTTP + DB).

Grafo inyectado por override con MemorySaver + extractor FALSO (determinista, sin LLM) +
la sesión transaccional del test. Verifica el HITL por HTTP: chat deja pending_action
(pausa), /resume aprobado registra, rechazado no.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager

import jwt
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.orm import Session

from src.api.composition_root import get_aispace_graph
from src.config import settings
from src.contexts.aispace.agents.finance.tools.transactions import execute_register_transaction
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.main import app
from src.shared.money import Currency

DOP = Currency("DOP")


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


class _StubFinanceAgent:
    """Agente determinista (sin LLM): run() stagea un gasto; commit() escribe de verdad."""

    intents = ("register_expense", "query_metrics")

    def __init__(self, factory):  # type: ignore[no-untyped-def]
        self._f = factory

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Preparé el registro, confírmalo.")],
            "pending_action": {
                "amount": 500, "category": "Gasolina", "merchant": None,
                "summary": "registrar RD$500 en Gasolina", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        execute_register_transaction(state["user_id"], self._f, amount=500, category="Gasolina")
        return "Listo, registré RD$500 en Gasolina."


def _test_graph(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def factory():
        yield session

    agent = _StubFinanceAgent(factory)
    return build_graph(MemorySaver(), classifier=lambda t, c: "other", registry={"register_expense": agent})


def _seed_wallet(session: Session, user_id: str) -> Account:
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    SqlAccountRepository(session).add(banco)
    return banco


def test_chat_pauses_then_resume_registers(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco = _seed_wallet(db_session, user_id)
    graph = _test_graph(db_session)
    app.dependency_overrides[get_aispace_graph] = lambda: graph
    try:
        client = TestClient(app)
        r1 = client.post(
            "/v1/aispace/chat",
            json={"message": "gasté 500 en gasolina"},
            headers=_bearer(user_id),
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["pending_action"] is not None       # pausó esperando confirmación (HITL)
        thread_id = b1["thread_id"]

        r2 = client.post(
            "/v1/aispace/chat/resume",
            json={"thread_id": thread_id, "approved": True},
            headers=_bearer(user_id),
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["pending_action"] is None     # se ejecutó
    finally:
        app.dependency_overrides.clear()

    assert SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)[banco.id] == -50_000


def test_chat_resume_rejected_registers_nothing(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco = _seed_wallet(db_session, user_id)
    graph = _test_graph(db_session)
    app.dependency_overrides[get_aispace_graph] = lambda: graph
    try:
        client = TestClient(app)
        tid = client.post(
            "/v1/aispace/chat", json={"message": "gasté 500 en gasolina"}, headers=_bearer(user_id)
        ).json()["thread_id"]
        client.post(
            "/v1/aispace/chat/resume",
            json={"thread_id": tid, "approved": False},
            headers=_bearer(user_id),
        )
    finally:
        app.dependency_overrides.clear()

    # rechazado → ningún posting sobre la wallet
    assert banco.id not in SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)


def test_chat_without_token_is_401() -> None:
    res = TestClient(app).post("/v1/aispace/chat", json={"message": "hola"})
    assert res.status_code == 401

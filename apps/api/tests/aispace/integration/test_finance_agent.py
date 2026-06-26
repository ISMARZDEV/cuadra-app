"""Integration — FinanceAgent e2e con LLM REAL + DB (grafo completo, HITL aprobado).

Prueba que "gasté 500 en gasolina" → router → extractor LLM → confirm → tool → ledger:
el gasto queda persistido con amount_minor=50000 (la cifra sale del código, no del modelo).
Se salta si no hay key de LLM (igual que las de DB se saltan sin Postgres).
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command
from sqlalchemy.orm import Session

from src.config import settings
from src.contexts.aispace.agents.finance.agent import FinanceAgent
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.router import llm_classifier
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.shared.money import Currency

pytestmark = pytest.mark.skipif(
    not (settings.openai_api_key or settings.anthropic_api_key),
    reason="sin key de LLM",
)
DOP = Currency("DOP")


def _factory(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def _f():
        yield session
    return _f


def test_register_expense_end_to_end(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    accounts = SqlAccountRepository(db_session)
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    accounts.add(banco)

    agent = FinanceAgent(_factory(db_session))  # extractor real (LLM)
    graph = build_graph(MemorySaver(), classifier=llm_classifier, registry={"register_expense": agent})
    cfg = {"configurable": {"thread_id": "fa-e2e"}}

    graph.invoke(
        {"messages": [HumanMessage("gasté 500 en gasolina")], "user_id": user_id, "capabilities": []},
        cfg,
    )
    graph.invoke(Command(resume="sí"), cfg)  # HITL aprobado

    balances = SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)
    assert balances[banco.id] == -50_000  # el gasto bajó la wallet RD$500 → minor en código

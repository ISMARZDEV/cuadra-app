"""Integration — FinanceAgent v2 (create_agent/ReAct) con LLM REAL + DB.

Prueba que el LLM ELIGE la tool correcta:
  - "gasté 500 en gasolina" → register_transaction (stage) → HITL → commit → ledger (−50000).
  - "cuánto llevo gastado este mes" → get_monthly_summary (lectura, sin HITL) → responde.
Se salta si no hay key de LLM.
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
from src.contexts.aispace.agents.finance.tools.transactions import execute_register_transaction
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.registry import build_registry
from src.contexts.aispace.orchestration.router import llm_classifier
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.metrics import SqlInsightsMetricsRepository
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.shared.money import Currency

pytestmark = pytest.mark.skipif(
    not (settings.openai_api_key or settings.anthropic_api_key), reason="sin key de LLM"
)
DOP = Currency("DOP")


def _factory(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def _f():
        yield session
    return _f


def _graph_for(session: Session):  # type: ignore[no-untyped-def]
    return build_graph(
        MemorySaver(), classifier=llm_classifier, registry=build_registry(_factory(session))
    )


def _seed_wallet(session: Session, user_id: str) -> Account:
    banco = Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
    SqlAccountRepository(session).add(banco)
    return banco


def test_register_expense_end_to_end(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    banco = _seed_wallet(db_session, user_id)
    graph = _graph_for(db_session)
    cfg = {"configurable": {"thread_id": "fa-write"}}

    out = graph.invoke(
        {"messages": [HumanMessage("gasté 500 en gasolina")], "user_id": user_id, "capabilities": []},
        cfg,
    )
    assert "__interrupt__" in out                         # escritura → HITL
    graph.invoke(Command(resume="sí"), cfg)               # aprobar

    balances = SqlInsightsMetricsRepository(db_session).balances_by_account(user_id)
    assert balances[banco.id] == -50_000


def test_query_monthly_summary_is_read_only(db_session: Session) -> None:
    user_id = str(uuid.uuid4())
    _seed_wallet(db_session, user_id)
    execute_register_transaction(user_id, _factory(db_session), amount=300, category="Comida")
    graph = _graph_for(db_session)
    cfg = {"configurable": {"thread_id": "fa-read"}}

    out = graph.invoke(
        {"messages": [HumanMessage("¿cuánto llevo gastado este mes?")], "user_id": user_id, "capabilities": []},
        cfg,
    )
    assert "__interrupt__" not in out                     # lectura → sin HITL
    assert out["messages"][-1].content                    # respondió algo

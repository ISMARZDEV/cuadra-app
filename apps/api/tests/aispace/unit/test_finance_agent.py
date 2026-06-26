"""Unit — FinanceAgent.plan() con extractor FALSO (sin LLM): forma del pending_action."""
from __future__ import annotations

from langchain_core.messages import HumanMessage

from src.contexts.aispace.agents.finance.agent import FinanceAgent


def _fake_extractor(text: str) -> dict:
    return {"amount": 500.0, "category": "Gasolina", "merchant": "Shell"}


def test_plan_builds_confirmable_pending_action() -> None:
    agent = FinanceAgent(session_factory=None, extractor=_fake_extractor)  # type: ignore[arg-type]
    pa = agent.plan({"messages": [HumanMessage("gasté 500 en gasolina")]})

    assert pa["tool"] == "register_transaction"
    assert pa["args"]["amount"] == 500.0
    assert pa["requires_confirmation"] is True       # es escritura → HITL
    assert "Gasolina" in pa["summary"]

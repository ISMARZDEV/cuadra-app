"""Integration — GeneralAgent con LLM REAL: conversa (no devuelve el canned), sin HITL.

Verifica end-to-end que `run` produce una respuesta del modelo (no vacía) y no stagea ninguna
escritura. La calidad fina del tono se valida en device. Se salta si no hay key de LLM.
"""
from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from src.config import settings
from src.contexts.aispace.agents.general.agent import GeneralAgent
from src.contexts.aispace.preferences.enums import Personality

pytestmark = pytest.mark.skipif(
    not (settings.openai_api_key or settings.anthropic_api_key), reason="sin key de LLM"
)


def test_general_agent_replies_without_pending_action() -> None:
    state = {
        "messages": [HumanMessage("hola, ¿cómo estás?")],
        "user_id": "u1",
        "capabilities": [],
        "language": "es",
        "personality": Personality.COACH,
    }
    out = GeneralAgent().run(state)

    assert out["pending_action"] is None              # conversa: no escribe → sin HITL
    assert out["messages"][-1].content.strip()        # respondió algo real

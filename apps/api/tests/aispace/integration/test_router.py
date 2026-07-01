"""Integration — el clasificador LLM REAL mapea cada mensaje a la intención correcta.

Cubre el cambio del slice del GeneralAgent: smalltalk → `general` (antes caía en el canned
`other`). Los flujos financieros NO deben regresar. Se salta si no hay key de LLM.
"""
from __future__ import annotations

import pytest

from src.config import settings
from src.contexts.aispace.orchestration.router import llm_classifier

pytestmark = pytest.mark.skipif(
    not (settings.openai_api_key or settings.anthropic_api_key), reason="sin key de LLM"
)


@pytest.mark.parametrize(
    "text",
    ["hola", "buenas, ¿cómo estás?", "gracias!", "cuéntame un chiste", "qué tal tu día"],
)
def test_smalltalk_maps_to_general(text: str) -> None:
    assert llm_classifier(text, []) == "general"


@pytest.mark.parametrize(
    "text",
    ["me pagaron 20000 de salario", "compré una pizza de 350"],
)
def test_money_movement_maps_to_register_expense(text: str) -> None:
    assert llm_classifier(text, []) == "register_expense"


@pytest.mark.parametrize(
    "text",
    ["cuál es mi balance", "cuánto puedo gastar hoy", "cuánto llevo gastado este mes"],
)
def test_money_questions_map_to_query_metrics(text: str) -> None:
    assert llm_classifier(text, []) == "query_metrics"

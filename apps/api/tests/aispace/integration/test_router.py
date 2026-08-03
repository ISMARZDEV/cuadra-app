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


@pytest.mark.parametrize(
    "text",
    [
        "con RD$10,000 qué me alcanza para la compra del hogar",
        "¿dónde está más barato el arroz Rica?",
        "precio del aceite",
        "armame una lista de compra",
        "qué súper me conviene para el café",
        "cuánto cuesta un bebé al mes en el súper",
        "quiero comprar 2 libras de pollo, cuál está más barato",
    ],
)
def test_supermarket_questions_map_to_groceries(text: str) -> None:
    """Las 5 preguntas guía de §1.2 + las frases que el cortocircuito secuestraba."""
    assert llm_classifier(text, []) == "groceries"


@pytest.mark.parametrize(
    "text",
    [
        "gasté 500 comprando arroz",          # frontera: gasto PASADO con producto de súper
        "compré una pizza de 350",
        "pagué 1200 en el supermercado ayer",
    ],
)
def test_a_past_purchase_is_still_an_expense_not_groceries(text: str) -> None:
    """El par confundible (§13, riesgo 5). El tiempo verbal es lo que discrimina."""
    assert llm_classifier(text, []) == "register_expense"


@pytest.mark.parametrize(
    "text",
    ["cuánto gasté en el súper este mes", "cuánto llevo gastado en comida"],
)
def test_asking_about_MY_spending_is_metrics_not_groceries(text: str) -> None:
    """Insights, no Save: pregunta por SU dinero, no por precios del catálogo."""
    assert llm_classifier(text, []) == "query_metrics"

"""Unit — el cortocircuito determinista del router: a quién atrapa y a quién NO.

El cortocircuito existe para ahorrar una llamada LLM cuando el lenguaje es inequívoco. Un
token que matchea DOS intenciones opuestas no discrimina ninguna: `compr` nombra a la vez
«compré» (registrar un gasto pasado) y «la compra / comprar» (ir al súper). Estos tests fijan
la frontera — sin LLM, con un clasificador fake.
"""
from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from src.contexts.aispace.orchestration.router import make_classify_intent

_DELEGATED = "__classifier_was_called__"


class _SpyClassifier:
    """Fake inyectable: registra que lo llamaron y devuelve un centinela."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, text: str, capabilities: list[str]) -> str:
        self.calls.append(text)
        return _DELEGATED


def _classify(text: str) -> tuple[dict, _SpyClassifier]:
    spy = _SpyClassifier()
    node = make_classify_intent(spy)
    return node({"messages": [HumanMessage(text)]}), spy


@pytest.mark.parametrize(
    "text",
    [
        "con RD$10,000 qué me alcanza para la compra del hogar",
        "quiero comprar 2 libras de pollo, cuál está más barato",
        "armame la compra del mes con 5000 pesos",
        "compré una pizza de 350",
    ],
)
def test_buying_verbs_are_not_short_circuited(text: str) -> None:
    """`compr` + dígitos ya NO secuestra: decide el clasificador, que sí lee el contexto."""
    out, spy = _classify(text)

    assert out == {"intent": _DELEGATED}
    assert spy.calls == [text]


@pytest.mark.parametrize(
    "text",
    [
        "gasté 500 en gasolina",
        "gaste 1200 en el super",
        "pagué 3000 de luz",
    ],
)
def test_spending_verbs_still_short_circuit(text: str) -> None:
    """Los verbos de gasto siguen resolviéndose sin pagar una llamada LLM."""
    out, spy = _classify(text)

    assert out == {"intent": "register_expense"}
    assert spy.calls == []


@pytest.mark.parametrize(
    "text",
    [
        "¿dónde está más barato el arroz Rica?",
        "gasté mucho el mes pasado",  # sin dígitos → no hay cortocircuito
        "me pagaron 20000 de salario",  # el patrón es `pagu`, no `paga` → lo resuelve el LLM
    ],
)
def test_messages_without_the_pattern_reach_the_classifier(text: str) -> None:
    out, spy = _classify(text)

    assert out == {"intent": _DELEGATED}
    assert spy.calls == [text]

"""Unit — intent PEGAJOSO para seguimientos elípticos (§5.4·C). Sin LLM.

    Usuario: «¿dónde está más barato el arroz Campos?»   → groceries
    Usuario: «¿y el aceite?»                              → hoy caía en `general`

El clasificador solo ve el ÚLTIMO mensaje humano, así que aislado «¿y el aceite?» no parece una
consulta de supermercado. Mantener el intent gana en las tres dimensiones a la vez: más preciso
(no se pierde el hilo), más barato (se salta una llamada LLM) y más rápido (un salto menos).

⚠️ **La guarda es lo que hace que esto no sea peligroso.** Sin ella el agente SECUESTRA la
conversación — el defecto de la Fase 1 al revés. Por eso la pegajosidad es deliberadamente
ESTRECHA: solo elipsis reales, solo desde intents de LECTURA.
"""
from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from src.contexts.aispace.orchestration.router import make_classify_intent

_DELEGATED = "__classifier_was_called__"


class _Spy:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, text: str, capabilities: list[str]) -> str:
        self.calls.append(text)
        return _DELEGATED


def _classify(text: str, previous: str | None = None) -> tuple[dict, _Spy]:
    spy = _Spy()
    state: dict = {"messages": [HumanMessage(text)]}
    if previous is not None:
        state["intent"] = previous
    return make_classify_intent(spy)(state), spy


class TestSePega:
    @pytest.mark.parametrize(
        "text", ["¿y el aceite?", "y la leche", "¿y el café?", "y arroz?", "¿y las habichuelas?"]
    )
    def test_an_elliptical_follow_up_keeps_the_groceries_intent(self, text: str) -> None:
        out, spy = _classify(text, previous="groceries")

        assert out == {"intent": "groceries"}
        assert spy.calls == [], "no debería pagar una llamada al clasificador"

    def test_it_also_sticks_to_query_metrics(self) -> None:
        out, _ = _classify("¿y este mes?", previous="query_metrics")

        assert out == {"intent": "query_metrics"}


class TestNoSePega:
    def test_it_NEVER_sticks_to_a_write_intent(self) -> None:
        """Pegarse a `register_expense` significaría re-registrar gastos por una elipsis."""
        out, spy = _classify("¿y el aceite?", previous="register_expense")

        assert out == {"intent": _DELEGATED}
        assert spy.calls == ["¿y el aceite?"]

    def test_without_a_previous_intent_there_is_nothing_to_stick_to(self) -> None:
        out, spy = _classify("¿y el aceite?", previous=None)

        assert out == {"intent": _DELEGATED}

    def test_a_long_message_breaks_the_stickiness(self) -> None:
        """La guarda: si el usuario cambió de tema con una frase completa, decide el clasificador."""
        out, spy = _classify(
            "y ahora contame cómo va mi presupuesto de este mes por favor", previous="groceries"
        )

        assert out == {"intent": _DELEGATED}
        assert spy.calls

    @pytest.mark.parametrize("text", ["hola", "gracias!", "cuéntame un chiste", "qué tal"])
    def test_a_short_message_that_is_NOT_elliptical_is_classified(self, text: str) -> None:
        """Corto no alcanza: tiene que ser una ELIPSIS («y …»), no cualquier frase breve."""
        out, spy = _classify(text, previous="groceries")

        assert out == {"intent": _DELEGATED}

    def test_the_expense_short_circuit_still_wins_over_stickiness(self) -> None:
        """Un gasto explícito manda, aunque el turno anterior fuera de supermercado."""
        out, spy = _classify("gasté 500 en gasolina", previous="groceries")

        assert out == {"intent": "register_expense"}
        assert spy.calls == []

    def test_an_ellipsis_carrying_an_expense_verb_is_not_sticky(self) -> None:
        """«y compré pan» es un gasto, no un seguimiento de precios."""
        out, spy = _classify("y compré pan", previous="groceries")

        assert out == {"intent": _DELEGATED}

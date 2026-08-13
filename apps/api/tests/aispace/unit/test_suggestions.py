"""Sugerencias de escritura (T2 de la cascada del carrusel del chat).

El cliente resuelve solo lo que puede sin gastar un token: su historial (T0) y el catálogo de Save
por pg_trgm (T1). Este módulo es el ÚLTIMO recurso — lo que ni el historial ni el catálogo pueden
ver, como "cuánto gasté este mes", que no es ningún producto.

Por eso lo que más se prueba aquí NO es la calidad de la sugerencia (eso es del modelo), sino
CUÁNDO se decide no llamarlo y qué pasa cuando falla.
"""
from __future__ import annotations

from unittest.mock import patch

from src.contexts.aispace.suggestions import suggest_prompts


class _FakeModel:
    """Devuelve lo que se le diga y registra el prompt que recibió."""

    def __init__(self, items: list[str] | Exception) -> None:
        self._items = items
        self.prompts: list[str] = []

    def with_structured_output(self, _schema: type) -> "_FakeModel":
        return self

    def invoke(self, prompt: str):  # noqa: ANN201 — devuelve el schema Pydantic real
        self.prompts.append(prompt)
        if isinstance(self._items, Exception):
            raise self._items
        from src.contexts.aispace.suggestions import _Prompts

        return _Prompts(items=self._items)


def _with_model(model: _FakeModel):
    return patch("src.contexts.aispace.suggestions.get_chat_model", return_value=model)


def test_completes_the_draft_into_full_questions() -> None:
    model = _FakeModel(["¿Cuánto gasté este mes?", "¿En qué gasté más?"])

    with _with_model(model):
        assert suggest_prompts("cuanto gaste", "es") == [
            "¿Cuánto gasté este mes?",
            "¿En qué gasté más?",
        ]


def test_returns_at_most_three() -> None:
    model = _FakeModel([f"pregunta {i}" for i in range(9)])

    with _with_model(model):
        assert len(suggest_prompts("cuanto", "es")) == 3


def test_asks_the_model_to_write_in_the_users_language() -> None:
    model = _FakeModel(["How much did I spend?"])

    with _with_model(model):
        suggest_prompts("how much", "en")

    assert "English" in model.prompts[0]


def test_drops_blanks_and_duplicates() -> None:
    model = _FakeModel(["  ", "¿Cuánto gasté?", "¿Cuánto gasté?", "\t"])

    with _with_model(model):
        assert suggest_prompts("cuanto", "es") == ["¿Cuánto gasté?"]


# UN BORRADOR VACÍO NO VALE UNA LLAMADA. El carrusel ya tiene el catálogo estático para ese caso;
# preguntarle al modelo "completá la nada" es pagar tokens por ruido.
def test_does_not_call_the_model_for_a_draft_too_short_to_mean_anything() -> None:
    model = _FakeModel(["no debería llegar acá"])

    with _with_model(model):
        assert suggest_prompts("  ", "es") == []
        assert suggest_prompts("cu", "es") == []

    assert model.prompts == []


# Las sugerencias son una COMODIDAD. Si el modelo se cae, está sin cuota o tarda de más, el chat
# tiene que seguir funcionando igual — el cliente se queda con su catálogo estático.
def test_a_broken_model_yields_no_suggestions_instead_of_an_error() -> None:
    model = _FakeModel(RuntimeError("429 sin cuota"))

    with _with_model(model):
        assert suggest_prompts("cuanto gaste", "es") == []


def test_an_unknown_locale_falls_back_to_spanish() -> None:
    model = _FakeModel(["¿Cuánto gasté?"])

    with _with_model(model):
        suggest_prompts("cuanto", "kl")

    assert "Spanish" in model.prompts[0]

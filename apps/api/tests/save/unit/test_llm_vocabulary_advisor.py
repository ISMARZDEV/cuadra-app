"""Unit — `LlmVocabularyAdvisor`. Sin LLM real: el modelo se inyecta.

Contrato fail-safe, igual que los dos jueces: cualquier fallo devuelve `None` = "no sé". No existe
camino que convierta un error en una propuesta.
"""
from __future__ import annotations

from pydantic import BaseModel

from src.contexts.save.infrastructure.classification.llm_vocabulary_advisor import (
    LlmVocabularyAdvisor,
)

_CANDIDATES = [("n-detergentes", "Detergentes & Jabón De Lavar"), ("n-limpiadores", "Limpiadores")]


class _Model:
    def __init__(self, result) -> None:  # type: ignore[no-untyped-def]
        self._result = result
        self.prompt: str | None = None

    def invoke(self, prompt: str):  # type: ignore[no-untyped-def]
        self.prompt = prompt
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class _Parsed(BaseModel):
    """Fake FIEL: `with_structured_output` devuelve un `BaseModel` de pydantic, y el adapter
    distingue ese caso (`isinstance(parsed, BaseModel)`). Un fake que no lo fuera probaría una
    rama que en producción no se recorre."""

    choice: int


def _advisor(result):  # type: ignore[no-untyped-def]
    return LlmVocabularyAdvisor(model=_Model(result))


def _ask(advisor):  # type: ignore[no-untyped-def]
    return advisor.suggest_leaf(
        token="detergente", current_leaf="Detergente De Bebé", candidate_leaves=_CANDIDATES
    )


def test_it_maps_the_chosen_number_back_to_the_leaf_id() -> None:
    assert _ask(_advisor({"parsed": _Parsed(choice=1), "parsing_error": None})) == "n-detergentes"
    assert _ask(_advisor({"parsed": _Parsed(choice=2), "parsing_error": None})) == "n-limpiadores"


def test_zero_means_none_fits_and_is_a_legitimate_answer() -> None:
    # Se le pide explícitamente que prefiera 0 antes que forzar un mal encaje: una respuesta
    # equivocada cuesta más que ninguna, porque le hace perder el tiempo a quien revisa.
    assert _ask(_advisor({"parsed": _Parsed(choice=0), "parsing_error": None})) is None


def test_an_out_of_range_choice_is_treated_as_not_knowing() -> None:
    # El modelo no puede inventar una hoja que no está en el menú.
    assert _ask(_advisor({"parsed": _Parsed(choice=99), "parsing_error": None})) is None


def test_a_client_failure_degrades_to_not_knowing() -> None:
    assert _ask(_advisor(RuntimeError("API caída"))) is None


def test_unparseable_output_degrades_to_not_knowing() -> None:
    assert _ask(_advisor({"parsed": None, "parsing_error": "boom"})) is None


def test_without_candidates_it_never_calls_the_model() -> None:
    model = _Model({"parsed": _Parsed(choice=1), "parsing_error": None})
    resultado = LlmVocabularyAdvisor(model=model).suggest_leaf(
        token="x", current_leaf="y", candidate_leaves=[]
    )
    assert resultado is None
    assert model.prompt is None, "sin opciones no hay nada que preguntar — no se gasta la llamada"


def test_the_prompt_lists_the_candidates_by_number() -> None:
    model = _Model({"parsed": _Parsed(choice=1), "parsing_error": None})
    _ask(LlmVocabularyAdvisor(model=model))

    assert "1. Detergentes & Jabón De Lavar" in model.prompt
    assert "2. Limpiadores" in model.prompt
    assert "detergente" in model.prompt

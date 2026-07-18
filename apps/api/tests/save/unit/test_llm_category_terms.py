"""Unit — LlmCategoryTermsGenerator (save-category-classification). Modelo inyectado, sin cuota.

Genera los descriptores del dominio de una hoja para la receta de embedding. Fail-safe: cualquier
error del LLM → "" (no inventa; el use-case salta la hoja y reintenta luego).
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.llm_category_terms import (
    LlmCategoryTermsGenerator,
)


class _FakeModel:
    def __init__(self, result) -> None:  # type: ignore[no-untyped-def]
        self._result = result
        self.prompts: list[str] = []

    def invoke(self, prompt: str):  # type: ignore[no-untyped-def]
        self.prompts.append(prompt)
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


def _ok(terms: list[str]):  # type: ignore[no-untyped-def]
    class _T:
        def __init__(self, t): self.terms = t
    return {"parsed": _T(terms), "parsing_error": None}


def test_joins_terms_into_a_single_string() -> None:
    model = _FakeModel(_ok(["arroz", "habichuelas", "guandules"]))
    gen = LlmCategoryTermsGenerator(model=model)

    out = gen.generate("Arroz, Granos & Legumbres", "Despensa & Abarrotes")

    assert out == "arroz, habichuelas, guandules"
    assert "Arroz, Granos & Legumbres" in model.prompts[0]
    assert "Despensa & Abarrotes" in model.prompts[0]


def test_llm_error_degrades_to_empty_string() -> None:
    gen = LlmCategoryTermsGenerator(model=_FakeModel(RuntimeError("boom")))
    assert gen.generate("Agua", "Bebidas") == ""


def test_parsing_error_degrades_to_empty_string() -> None:
    gen = LlmCategoryTermsGenerator(model=_FakeModel({"parsed": None, "parsing_error": "bad"}))
    assert gen.generate("Agua", "Bebidas") == ""


def test_empty_terms_list_degrades_to_empty_string() -> None:
    gen = LlmCategoryTermsGenerator(model=_FakeModel(_ok([])))
    assert gen.generate("Agua", "Bebidas") == ""

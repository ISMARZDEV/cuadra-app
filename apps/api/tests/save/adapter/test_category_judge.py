"""Adapter — CategoryJudge (save-category-classification, Batch 6). Sin red/modelo real.

Fail-safe: cualquier error del cliente, salida no parseable o inválida → `uncertain` (NUNCA
inventa `match`). Modelo inyectado (fake) → los tests no tocan el cliente ni gastan tokens.
"""
from __future__ import annotations

from typing import Any

from src.contexts.save.domain.classification import ClassifiableProduct
from src.contexts.save.infrastructure.classification.category_judge import CategoryJudge

_PRODUCT = ClassifiableProduct(
    ref_id="sp-1", is_canonical=False, name="Arroz Blanco Sirena", brand="Sirena", size_text="5 Lb"
)


class _FakeModel:
    def __init__(self, result: Any) -> None:
        self._result = result

    def invoke(self, prompt: str) -> Any:
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class _Parsed:
    def __init__(self, decision: str, confidence: float, cited_fields: list[str]) -> None:
        self.decision = decision
        self.confidence = confidence
        self.cited_fields = cited_fields

    def model_dump(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "confidence": self.confidence,
            "cited_fields": self.cited_fields,
        }


def test_valid_match_verdict_is_returned() -> None:
    model = _FakeModel({
        "raw": None,
        "parsed": _Parsed("match", 0.9, ["name mentions arroz"]),
        "parsing_error": None,
    })
    verdict = CategoryJudge(model).judge(_PRODUCT, "Arroz, Granos & Legumbres")
    assert verdict.decision == "match"
    assert verdict.confidence == 0.9


def test_client_error_degrades_to_uncertain() -> None:
    verdict = CategoryJudge(_FakeModel(RuntimeError("boom"))).judge(_PRODUCT, "Cerveza")
    assert verdict.decision == "uncertain"
    assert verdict.confidence == 0.0


def test_unparseable_output_degrades_to_uncertain() -> None:
    model = _FakeModel({"raw": None, "parsed": None, "parsing_error": ValueError("bad")})
    assert CategoryJudge(model).judge(_PRODUCT, "Cerveza").decision == "uncertain"


def test_out_of_range_confidence_degrades_to_uncertain() -> None:
    model = _FakeModel({
        "raw": None,
        "parsed": _Parsed("match", 1.7, []),  # confianza inválida → validación falla
        "parsing_error": None,
    })
    assert CategoryJudge(model).judge(_PRODUCT, "Cerveza").decision == "uncertain"

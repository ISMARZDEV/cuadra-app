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


# ------------------------------- instrumentación de costo (2026-08-01) --
#
# El juez de MATCHING instrumenta tokens y modelo desde F2·B1; el de CATEGORÍA no lo hacía, y es el
# que MÁS llama: 147 clasificaciones vía `llm` contra 12 del otro. O sea que el mayor gasto de LLM
# del subsistema era el único ciego — y sin medirlo no se puede decidir si bajar de tier.


class _Raw:
    """`AIMessage` falso con la metadata de uso, como la devuelve LangChain."""

    def __init__(self, usage: dict | None, model_name: str = "gpt-4o-fake") -> None:
        self.usage_metadata = usage
        self.response_metadata = {"model_name": model_name}


def test_a_verdict_carries_the_tokens_it_cost() -> None:
    model = _FakeModel({
        "raw": _Raw({"input_tokens": 210, "output_tokens": 18}),
        "parsed": _Parsed("match", 0.9, ["name"]),
        "parsing_error": None,
    })

    verdict = CategoryJudge(model=model).judge(_PRODUCT, "Arroz, Granos & Legumbres")

    assert verdict.input_tokens == 210
    assert verdict.output_tokens == 18
    assert verdict.model == "gpt-4o-fake"


def test_tokens_are_reported_even_when_the_output_is_unusable() -> None:
    # Se pagó la llamada aunque la respuesta no sirviera. Si la instrumentación no lo viera, el
    # gasto real quedaría subestimado justo en el camino que más falla.
    model = _FakeModel({
        "raw": _Raw({"input_tokens": 210, "output_tokens": 0}),
        "parsed": None,
        "parsing_error": "boom",
    })

    verdict = CategoryJudge(model=model).judge(_PRODUCT, "Arroz, Granos & Legumbres")

    assert verdict.decision == "uncertain"
    assert verdict.input_tokens == 210


def test_without_usage_metadata_the_cost_fields_stay_none() -> None:
    model = _FakeModel({
        "raw": _Raw(None), "parsed": _Parsed("match", 0.9, []), "parsing_error": None,
    })

    assert CategoryJudge(model=model).judge(_PRODUCT, "X").input_tokens is None


def test_the_default_model_is_the_fast_tier(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Guarda del A/B: este juez corre en `fast`, y volver a `smart` debe ser una decisión, no un
    descuido.

    Medido sobre 119 pares reales de banda gris: 96% de acuerdo en el desenlace, y de los 5
    desacuerdos `fast` acierta 3 contra 1 de `smart` — incluido `Galleta Arroz Baby Mum-Mum`, donde
    el modelo caro asigna «Arroz, Granos & Legumbres» a una galleta de bebé (el error del
    ingrediente que este subsistema combate).
    """
    from src.contexts.save.infrastructure.classification import category_judge as mod

    pedidos: list[str] = []

    class _Stub:
        def with_structured_output(self, *a, **k):  # type: ignore[no-untyped-def]
            return self

    def _fake(tier: str, **kwargs):  # type: ignore[no-untyped-def]
        pedidos.append(tier)
        return _Stub()

    monkeypatch.setattr(mod, "get_chat_model", _fake)
    CategoryJudge()

    assert pedidos == ["fast"]

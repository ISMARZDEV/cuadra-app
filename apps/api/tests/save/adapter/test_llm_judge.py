"""Adapter — LLM judge, grey-band arbitration (F2.0 cascade, design step 6).

The LangChain chat client is ALWAYS mocked here — no real API call, no tokens burned.
Every invalid/error path MUST degrade to `uncertain` (Sacred rule #4: fail-safe to the human
review queue, never a false auto-link via method="llm").
"""
from __future__ import annotations

import logging
from typing import Any

import pytest

from src.contexts.save.infrastructure.matching.llm_judge import (
    LlmJudge,
    JudgeVerdict,
)

_STORE_PRODUCT = {"name": "Leche Entera 1L", "brand": "Rica", "size": "1L", "ean": "7501234567890"}
_CANONICAL_PRODUCT = {"name": "Leche Entera Rica 1 Litro", "brand": "Rica", "size": "1L", "ean": None}


class _FakeRaw:
    """Stand-in for the LangChain `AIMessage` returned alongside the parsed verdict.

    `response_metadata` defaults to the Anthropic shape (`{"model": ...}`); pass it explicitly to
    simulate the OpenAI shape (`{"model_name": ...}`)."""

    def __init__(
        self,
        usage_metadata: dict[str, int] | None,
        response_metadata: dict[str, str] | None = None,
    ) -> None:
        self.usage_metadata = usage_metadata
        self.response_metadata = (
            response_metadata
            if response_metadata is not None
            else {"model": "claude-sonnet-4-6-fake"}
        )


class _FakeModel:
    """Stand-in for `get_chat_model(...).with_structured_output(_Verdict, include_raw=True)`."""

    def __init__(self, response: dict[str, Any] | None = None, *, raises: Exception | None = None) -> None:
        self._response = response
        self._raises = raises
        self.last_prompt: str | None = None
        self.call_count = 0

    def invoke(self, prompt: str) -> dict[str, Any]:
        self.call_count += 1
        self.last_prompt = prompt
        if self._raises is not None:
            raise self._raises
        assert self._response is not None
        return self._response


def _response(parsed: Any, *, usage: dict[str, int] | None = None, parsing_error: Exception | None = None) -> dict:
    return {
        "raw": _FakeRaw(usage) if usage is not None else _FakeRaw(None),
        "parsed": parsed,
        "parsing_error": parsing_error,
    }


def test_valid_match_decision_is_trusted() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 0.92, "cited_fields": ["brand", "size"]},
            usage={"input_tokens": 150, "output_tokens": 40},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(
        decision="match",
        confidence=0.92,
        cited_fields=["brand", "size"],
        input_tokens=150,
        output_tokens=40,
        model="claude-sonnet-4-6-fake",
    )


def test_valid_no_match_decision_is_trusted() -> None:
    model = _FakeModel(
        _response(
            {"decision": "no_match", "confidence": 0.81, "cited_fields": ["brand"]},
            usage={"input_tokens": 140, "output_tokens": 35},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(
        decision="no_match",
        confidence=0.81,
        cited_fields=["brand"],
        input_tokens=140,
        output_tokens=35,
        model="claude-sonnet-4-6-fake",
    )


def test_valid_uncertain_decision_is_trusted() -> None:
    model = _FakeModel(
        _response(
            {"decision": "uncertain", "confidence": 0.5, "cited_fields": ["name"]},
            usage={"input_tokens": 130, "output_tokens": 30},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(
        decision="uncertain",
        confidence=0.5,
        cited_fields=["name"],
        input_tokens=130,
        output_tokens=30,
        model="claude-sonnet-4-6-fake",
    )


def test_malformed_non_json_output_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(None, usage={"input_tokens": 100, "output_tokens": 10}, parsing_error=ValueError("not valid JSON"))
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_missing_fields_degrades_to_uncertain() -> None:
    # No `cited_fields` key at all — required by the schema.
    model = _FakeModel(
        _response({"decision": "match", "confidence": 0.9}, usage={"input_tokens": 100, "output_tokens": 10})
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_confidence_above_one_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 1.5, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_confidence_below_zero_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": -0.2, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_invalid_decision_literal_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "maybe", "confidence": 0.7, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_client_exception_degrades_to_uncertain_never_raises() -> None:
    model = _FakeModel(raises=TimeoutError("anthropic client timed out"))
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_never_returns_match_on_any_error_path() -> None:
    """Sacred rule #4 — exhaustively confirm NO error/invalid path can ever produce `match`."""
    error_models = [
        _FakeModel(_response(None, parsing_error=ValueError("bad json"))),
        _FakeModel(_response({"decision": "match", "confidence": 2.0, "cited_fields": []})),
        _FakeModel(_response({"decision": "not_a_real_decision", "confidence": 0.9, "cited_fields": ["x"]})),
        _FakeModel(_response({"confidence": 0.9, "cited_fields": ["x"]})),
        _FakeModel(raises=RuntimeError("boom")),
    ]
    for model in error_models:
        verdict = LlmJudge(model=model).judge(
            store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT
        )
        assert verdict.decision == "uncertain"
        assert verdict.decision != "match"


def test_token_usage_is_logged_per_call(caplog: pytest.LogCaptureFixture) -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 0.9, "cited_fields": ["brand"]},
            usage={"input_tokens": 222, "output_tokens": 33},
        )
    )
    judge = LlmJudge(model=model)

    with caplog.at_level(logging.INFO):
        judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert any("222" in r.message and "33" in r.message for r in caplog.records)


def test_token_usage_is_logged_even_when_output_is_invalid(caplog: pytest.LogCaptureFixture) -> None:
    """Tokens were still spent on an invalid response — cost instrumentation must still see it."""
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 5.0, "cited_fields": ["brand"]},
            usage={"input_tokens": 111, "output_tokens": 22},
        )
    )
    judge = LlmJudge(model=model)

    with caplog.at_level(logging.INFO):
        verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"
    assert any("111" in r.message and "22" in r.message for r in caplog.records)


def test_prompt_includes_given_fields_only_no_price_instruction() -> None:
    """The judge must be shown the actual fields it's comparing — not invent facts."""
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 0.9, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = LlmJudge(model=model)

    judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert model.last_prompt is not None
    assert "Leche Entera 1L" in model.last_prompt
    assert "Leche Entera Rica 1 Litro" in model.last_prompt
    assert "7501234567890" in model.last_prompt


# ---------------------------------------------------------------- 1.13/1.14: usage dict ----------


def test_log_token_usage_returns_dict_with_input_output_tokens_and_model() -> None:
    """F2·B1 (1.13): `_log_token_usage` must RETURN the usage, not just log it — the cascade
    use-case needs these values to wire `product_match.judge_*` (1.14)."""
    raw = _FakeRaw({"input_tokens": 222, "output_tokens": 33})

    result = LlmJudge._log_token_usage(raw)

    assert result == {"input_tokens": 222, "output_tokens": 33, "model": "claude-sonnet-4-6-fake"}


def test_log_token_usage_extracts_model_from_openai_model_name_key() -> None:
    """langchain-openai pone el modelo en `response_metadata["model_name"]` (NO "model"). El
    extractor debe leerlo, o `product_match.judge_model` se persiste como 'unknown' (bug de
    observabilidad detectado en el humo de activación, provider dev = openai/gpt-4o)."""
    raw = _FakeRaw(
        {"input_tokens": 100, "output_tokens": 20},
        response_metadata={"model_name": "gpt-4o-fake"},
    )

    result = LlmJudge._log_token_usage(raw)

    assert result == {"input_tokens": 100, "output_tokens": 20, "model": "gpt-4o-fake"}


def test_log_token_usage_falls_back_to_unknown_when_no_model_key() -> None:
    """Sin ninguna clave de modelo reconocida, degrada a 'unknown' (no revienta)."""
    raw = _FakeRaw({"input_tokens": 5, "output_tokens": 1}, response_metadata={})

    assert LlmJudge._log_token_usage(raw) == {
        "input_tokens": 5,
        "output_tokens": 1,
        "model": "unknown",
    }


def test_log_token_usage_returns_none_when_no_usage_metadata() -> None:
    raw = _FakeRaw(None)

    assert LlmJudge._log_token_usage(raw) is None


def test_log_token_usage_returns_none_when_raw_is_none() -> None:
    assert LlmJudge._log_token_usage(None) is None


def test_valid_verdict_carries_usage_for_cost_tracking() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 0.9, "cited_fields": ["brand"]},
            usage={"input_tokens": 180, "output_tokens": 45},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.input_tokens == 180
    assert verdict.output_tokens == 45
    assert verdict.model == "claude-sonnet-4-6-fake"


def test_schema_validation_failure_still_carries_usage_for_cost_tracking() -> None:
    """Tokens were spent even though the output was invalid (confidence out of range) — the
    degraded `uncertain` verdict must still carry the usage so cost tracking doesn't lose it."""
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 1.5, "cited_fields": ["brand"]},
            usage={"input_tokens": 111, "output_tokens": 22},
        )
    )
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"
    assert verdict.input_tokens == 111
    assert verdict.output_tokens == 22
    assert verdict.model == "claude-sonnet-4-6-fake"


def test_client_exception_verdict_has_no_usage() -> None:
    """No response came back at all — nothing to report, usage fields stay `None`."""
    model = _FakeModel(raises=TimeoutError("anthropic client timed out"))
    judge = LlmJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.input_tokens is None
    assert verdict.output_tokens is None
    assert verdict.model is None


def test_default_model_is_not_constructed_when_injected() -> None:
    """No real client should ever be touched when a fake is injected (no token burn possible)."""
    model = _FakeModel(
        _response(
            {"decision": "no_match", "confidence": 0.6, "cited_fields": ["brand"]},
            usage={"input_tokens": 10, "output_tokens": 5},
        )
    )
    judge = LlmJudge(model=model)

    judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert model.call_count == 1


def test_circuit_breaker_stops_calling_after_repeated_failures() -> None:
    # LLM caído (429): tras `threshold` fallos seguidos el breaker abre y el juez NO llama más el
    # modelo por el resto del batch (corta el retry-storm), degradando directo a 'uncertain'.
    from src.contexts.save.infrastructure.llm_circuit_breaker import LlmCircuitBreaker

    model = _FakeModel(raises=RuntimeError("429 insufficient_quota"))
    judge = LlmJudge(model=model, circuit_breaker=LlmCircuitBreaker(threshold=2))
    sp, cp = {"name": "arroz"}, {"name": "arroz canonico"}

    assert judge.judge(store_product=sp, canonical_product=cp).decision == "uncertain"  # fallo 1
    assert judge.judge(store_product=sp, canonical_product=cp).decision == "uncertain"  # fallo 2 → abre
    assert model.call_count == 2
    # 3ra vez: breaker ABIERTO → degrada SIN tocar el modelo
    assert judge.judge(store_product=sp, canonical_product=cp).decision == "uncertain"
    assert model.call_count == 2  # NO subió

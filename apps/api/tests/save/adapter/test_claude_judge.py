"""Adapter — Claude-judge, grey-band arbitration (F2.0 cascade, design step 6).

The Anthropic/LangChain client is ALWAYS mocked here — no real API call, no tokens burned.
Every invalid/error path MUST degrade to `uncertain` (Sacred rule #4: fail-safe to the human
review queue, never a false auto-link via method="llm").
"""
from __future__ import annotations

import logging
from typing import Any

import pytest

from src.contexts.save.infrastructure.matching.claude_judge import (
    ClaudeJudge,
    JudgeVerdict,
)

_STORE_PRODUCT = {"name": "Leche Entera 1L", "brand": "Rica", "size": "1L", "ean": "7501234567890"}
_CANONICAL_PRODUCT = {"name": "Leche Entera Rica 1 Litro", "brand": "Rica", "size": "1L", "ean": None}


class _FakeRaw:
    """Stand-in for the LangChain `AIMessage` returned alongside the parsed verdict."""

    def __init__(self, usage_metadata: dict[str, int] | None) -> None:
        self.usage_metadata = usage_metadata
        self.response_metadata = {"model": "claude-sonnet-4-6-fake"}


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
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(decision="match", confidence=0.92, cited_fields=["brand", "size"])


def test_valid_no_match_decision_is_trusted() -> None:
    model = _FakeModel(
        _response(
            {"decision": "no_match", "confidence": 0.81, "cited_fields": ["brand"]},
            usage={"input_tokens": 140, "output_tokens": 35},
        )
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(decision="no_match", confidence=0.81, cited_fields=["brand"])


def test_valid_uncertain_decision_is_trusted() -> None:
    model = _FakeModel(
        _response(
            {"decision": "uncertain", "confidence": 0.5, "cited_fields": ["name"]},
            usage={"input_tokens": 130, "output_tokens": 30},
        )
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict == JudgeVerdict(decision="uncertain", confidence=0.5, cited_fields=["name"])


def test_malformed_non_json_output_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(None, usage={"input_tokens": 100, "output_tokens": 10}, parsing_error=ValueError("not valid JSON"))
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_missing_fields_degrades_to_uncertain() -> None:
    # No `cited_fields` key at all — required by the schema.
    model = _FakeModel(
        _response({"decision": "match", "confidence": 0.9}, usage={"input_tokens": 100, "output_tokens": 10})
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_confidence_above_one_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": 1.5, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_confidence_below_zero_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "match", "confidence": -0.2, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_invalid_decision_literal_degrades_to_uncertain() -> None:
    model = _FakeModel(
        _response(
            {"decision": "maybe", "confidence": 0.7, "cited_fields": ["brand"]},
            usage={"input_tokens": 100, "output_tokens": 10},
        )
    )
    judge = ClaudeJudge(model=model)

    verdict = judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert verdict.decision == "uncertain"


def test_client_exception_degrades_to_uncertain_never_raises() -> None:
    model = _FakeModel(raises=TimeoutError("anthropic client timed out"))
    judge = ClaudeJudge(model=model)

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
        verdict = ClaudeJudge(model=model).judge(
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
    judge = ClaudeJudge(model=model)

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
    judge = ClaudeJudge(model=model)

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
    judge = ClaudeJudge(model=model)

    judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert model.last_prompt is not None
    assert "Leche Entera 1L" in model.last_prompt
    assert "Leche Entera Rica 1 Litro" in model.last_prompt
    assert "7501234567890" in model.last_prompt


def test_default_model_is_not_constructed_when_injected() -> None:
    """No real client should ever be touched when a fake is injected (no token burn possible)."""
    model = _FakeModel(
        _response(
            {"decision": "no_match", "confidence": 0.6, "cited_fields": ["brand"]},
            usage={"input_tokens": 10, "output_tokens": 5},
        )
    )
    judge = ClaudeJudge(model=model)

    judge.judge(store_product=_STORE_PRODUCT, canonical_product=_CANONICAL_PRODUCT)

    assert model.call_count == 1

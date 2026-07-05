"""Claude-judge adapter — arbitrates the grey-band candidate pair (F2.0 cascade, design step 6).

Called ONLY for the single top grey-band candidate handed to it by the cascade use-case
(Batch 7). It does NOT run the cascade, does NOT pick which candidate to judge, and must NEVER
output or compute a price — it only compares the given fields and cites which ones agreed or
disagreed.

Fail-safe contract (Sacred rule #4): the LLM's raw output is NEVER trusted directly. Structured
output forces the shape, but this adapter re-validates it independently — ANY parsing error,
missing/invalid field, out-of-range confidence, unrecognized `decision`, or client
exception/timeout degrades to `uncertain` (which routes to the human review queue upstream).
There is no code path that can turn an error into `match`.

Reuses the existing `LLMPort` (`src.shared.llm.get_chat_model`, §7.8) rather than talking to the
Anthropic SDK directly, so the provider stays swappable and this file needs no new client/config.
The model is dependency-injected (`model` param) so tests never touch the real client or burn
tokens.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from src.shared.llm import get_chat_model

logger = logging.getLogger(__name__)

_DECISIONS = ("match", "no_match", "uncertain")

# Patrón cuadra-agent-prompts: instrucciones en inglés (el modelo las lee mejor), STRUCTURED
# OUTPUT forzado vía with_structured_output — nunca le pedimos que "decida el precio", solo que
# compare los campos dados y cite acuerdos/desacuerdos.
_PROMPT = """You are comparing two product records to decide whether they refer to the SAME
physical product sold at possibly different stores. Use ONLY the fields given below — do not
invent facts not present in them.

Store product (seen at ingestion time):
  name="{store_name}", brand="{store_brand}", size="{store_size}", ean="{store_ean}"

Canonical product (existing catalog candidate):
  name="{canonical_name}", brand="{canonical_brand}", size="{canonical_size}", ean="{canonical_ean}"

Decide "match" only if you are confident these are the same product. Decide "no_match" if you are
confident they are different products. Decide "uncertain" if the fields are ambiguous or
insufficient to decide either way.

List exactly which fields you compared and whether each agreed or disagreed (e.g. "brand agrees",
"size disagrees"). Do NOT output a price or any number other than your confidence (0.0-1.0)."""


class _Verdict(BaseModel):
    """Structured-output schema handed to `with_structured_output`."""

    decision: Literal["match", "no_match", "uncertain"]
    confidence: float = Field(ge=0.0, le=1.0)
    cited_fields: list[str]


@dataclass(frozen=True)
class JudgeVerdict:
    """The trusted, already-validated result of a judge call."""

    decision: Literal["match", "no_match", "uncertain"]
    confidence: float
    cited_fields: list[str]


class StructuredChatModel(Protocol):
    """Shape needed from the injected client — matches
    `get_chat_model(...).with_structured_output(_Verdict, include_raw=True)`, which returns
    `{"raw": AIMessage, "parsed": _Verdict | None, "parsing_error": Exception | None}`."""

    def invoke(self, prompt: str) -> dict[str, Any]: ...


# Fail-safe verdict: returned on ANY invalid output or error. Never `match`, never a price.
_UNCERTAIN = JudgeVerdict(decision="uncertain", confidence=0.0, cited_fields=[])


class ClaudeJudge:
    """Adapter around the LLM judge for the grey-band cascade step."""

    def __init__(self, model: StructuredChatModel | None = None) -> None:
        self._model = model or get_chat_model("smart").with_structured_output(
            _Verdict, include_raw=True
        )

    def judge(self, *, store_product: dict[str, Any], canonical_product: dict[str, Any]) -> JudgeVerdict:
        prompt = _PROMPT.format(
            store_name=store_product.get("name") or "—",
            store_brand=store_product.get("brand") or "—",
            store_size=store_product.get("size") or "—",
            store_ean=store_product.get("ean") or "—",
            canonical_name=canonical_product.get("name") or "—",
            canonical_brand=canonical_product.get("brand") or "—",
            canonical_size=canonical_product.get("size") or "—",
            canonical_ean=canonical_product.get("ean") or "—",
        )

        try:
            result = self._model.invoke(prompt)
        except Exception:
            logger.warning("claude_judge: client call failed, degrading to uncertain", exc_info=True)
            return _UNCERTAIN

        raw = result.get("raw") if isinstance(result, dict) else None
        self._log_token_usage(raw)

        parsing_error = result.get("parsing_error") if isinstance(result, dict) else "missing raw dict"
        parsed = result.get("parsed") if isinstance(result, dict) else None
        if parsing_error is not None or parsed is None:
            logger.warning("claude_judge: unparseable output, degrading to uncertain")
            return _UNCERTAIN

        payload = parsed.model_dump() if isinstance(parsed, BaseModel) else parsed
        try:
            verdict = _Verdict.model_validate(payload)
        except ValidationError:
            logger.warning("claude_judge: schema validation failed, degrading to uncertain")
            return _UNCERTAIN

        return JudgeVerdict(
            decision=verdict.decision, confidence=verdict.confidence, cited_fields=verdict.cited_fields
        )

    @staticmethod
    def _log_token_usage(raw: Any) -> None:
        """Cost instrumentation — logged whenever a response came back, even an invalid one
        (tokens were spent regardless of whether we could trust the content)."""
        usage = getattr(raw, "usage_metadata", None) if raw is not None else None
        if not usage:
            return
        model_name = getattr(raw, "response_metadata", {}).get("model", "unknown")
        logger.info(
            "claude_judge token usage: model=%s input_tokens=%s output_tokens=%s",
            model_name,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
        )

"""LLM judge adapter — arbitrates the grey-band candidate pair (F2.0 cascade, design step 6).

Provider-agnostic ON PURPOSE: the concrete model is whatever `LLM_PROVIDER` selects
(`get_chat_model("smart")` → gpt-4o in dev / claude-sonnet-4-6 in prod). The name is generic so it
never lies about which vendor runs — this file must NOT hardcode a provider.

Called ONLY for the single top grey-band candidate handed to it by the cascade use-case
(Batch 7). It does NOT run the cascade, does NOT pick which candidate to judge, and must NEVER
output or compute a price — it only compares the given fields and cites which ones agreed or
disagreed.

Fail-safe contract (Sacred rule #4): the LLM's raw output is NEVER trusted directly. Structured
output forces the shape, but this adapter re-validates it independently — ANY parsing error,
missing/invalid field, out-of-range confidence, unrecognized `decision`, or client
exception/timeout degrades to `uncertain` (which routes to the human review queue upstream).
There is no code path that can turn an error into `match`.

Reuses the existing `LLMPort` (`src.shared.llm.get_chat_model`, §7.8) rather than talking to any
vendor SDK directly, so the provider stays swappable and this file needs no new client/config.
The model is dependency-injected (`model` param) so tests never touch the real client or burn
tokens.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from src.contexts.save.infrastructure.llm_circuit_breaker import LlmCircuitBreaker
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
    """The trusted, already-validated result of a judge call.

    `input_tokens`/`output_tokens`/`model` (F2·B1, tarea 1.13-1.14) are the cost-instrumentation
    fields carried alongside the decision so the cascade use-case can persist them onto
    `product_match` on the grey-band/llm path — pure observability, never part of the decision.
    `None` when there is no usage to report (e.g. the client call raised before any response).

    `degraded` answers a DIFFERENT question from `decision`: did the judge actually render this
    verdict, or is it our fail-safe standing in for one? An open breaker, a client failure and an
    unreadable output ALL produce `uncertain` — but in none of those did the judge weigh the pair.
    Only this adapter can tell the difference (the use-case cannot see whether the API was called),
    so the answer travels WITH the verdict. The use-case needs it to record `method` honestly:
    `llm` must mean "the judge ruled", never "the judge was unreachable".
    """

    decision: Literal["match", "no_match", "uncertain"]
    confidence: float
    cited_fields: list[str]
    input_tokens: int | None = None
    output_tokens: int | None = None
    model: str | None = None
    degraded: bool = False


class StructuredChatModel(Protocol):
    """Shape needed from the injected client — matches
    `get_chat_model(...).with_structured_output(_Verdict, include_raw=True)`, which returns
    `{"raw": AIMessage, "parsed": _Verdict | None, "parsing_error": Exception | None}`."""

    def invoke(self, prompt: str) -> dict[str, Any]: ...


# Fail-safe verdict: returned on ANY invalid output or error. Never `match`, never a price.
# `degraded=True` — this is US standing in for the judge, not the judge speaking.
_UNCERTAIN = JudgeVerdict(decision="uncertain", confidence=0.0, cited_fields=[], degraded=True)


class LlmJudge:
    """Adapter around the LLM judge for the grey-band cascade step (provider chosen by config)."""

    def __init__(
        self,
        model: StructuredChatModel | None = None,
        *,
        circuit_breaker: LlmCircuitBreaker | None = None,
    ) -> None:
        # max_retries=0: un LLM caído falla al instante (sin backoff de minutos), así los pocos
        # intentos que hace el breaker ANTES de abrir son rápidos y la ingesta no se cuelga.
        self._model = model or get_chat_model("smart", max_retries=0).with_structured_output(
            _Verdict, include_raw=True
        )
        # Corta el retry-storm si el LLM está caído/sin cuota: tras N fallos deja de llamar la API.
        self._breaker = circuit_breaker or LlmCircuitBreaker()

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

        # Breaker abierto (el LLM viene fallando en este batch) → degradá SIN llamar la API.
        if self._breaker.is_open:
            return _UNCERTAIN

        try:
            result = self._model.invoke(prompt)
            self._breaker.record_success()
        except Exception:
            self._breaker.record_failure()
            logger.warning("llm_judge: client call failed, degrading to uncertain", exc_info=True)
            return _UNCERTAIN

        raw = result.get("raw") if isinstance(result, dict) else None
        usage = self._log_token_usage(raw)

        parsing_error = result.get("parsing_error") if isinstance(result, dict) else "missing raw dict"
        parsed = result.get("parsed") if isinstance(result, dict) else None
        if parsing_error is not None or parsed is None:
            logger.warning("llm_judge: unparseable output, degrading to uncertain")
            return self._uncertain_with_usage(usage)

        payload = parsed.model_dump() if isinstance(parsed, BaseModel) else parsed
        try:
            verdict = _Verdict.model_validate(payload)
        except ValidationError:
            logger.warning("llm_judge: schema validation failed, degrading to uncertain")
            return self._uncertain_with_usage(usage)

        return JudgeVerdict(
            decision=verdict.decision,
            confidence=verdict.confidence,
            cited_fields=verdict.cited_fields,
            input_tokens=usage.get("input_tokens") if usage else None,
            output_tokens=usage.get("output_tokens") if usage else None,
            model=usage.get("model") if usage else None,
        )

    @staticmethod
    def _uncertain_with_usage(usage: dict[str, Any] | None) -> JudgeVerdict:
        """Fail-safe `uncertain` verdict that still carries usage when tokens WERE spent (the
        call succeeded but the output was unparseable/invalid) — cost instrumentation must see
        it even on a degraded path. Falls back to the shared `_UNCERTAIN` singleton when there's
        no usage at all (e.g. the client raised before any response came back).

        Tokens spent and `degraded=True` are not contradictory — they are the honest reading of
        "we paid for a call and got nothing we could trust."
        """
        if usage is None:
            return _UNCERTAIN
        return JudgeVerdict(
            decision="uncertain",
            confidence=0.0,
            cited_fields=[],
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            model=usage.get("model"),
            degraded=True,
        )

    @staticmethod
    def _log_token_usage(raw: Any) -> dict[str, Any] | None:
        """Cost instrumentation — logged AND returned whenever a response came back, even an
        invalid one (tokens were spent regardless of whether we could trust the content).
        Returns `None` when there's no usage metadata to report."""
        usage = getattr(raw, "usage_metadata", None) if raw is not None else None
        if not usage:
            return None
        # Provider-agnóstico: langchain-openai expone el modelo en `model_name`, langchain-anthropic
        # en `model`. Leer solo "model" dejaba judge_model en 'unknown' con LLM_PROVIDER=openai.
        metadata = getattr(raw, "response_metadata", {}) or {}
        model_name = metadata.get("model_name") or metadata.get("model") or "unknown"
        logger.info(
            "llm_judge token usage: model=%s input_tokens=%s output_tokens=%s",
            model_name,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
        )
        return {
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "model": model_name,
        }

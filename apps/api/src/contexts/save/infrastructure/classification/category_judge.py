"""Category judge adapter — grey-band arbiter of the classification cascade (save-category-classification).

Decides whether a product belongs to a single candidate category handed to it by the cascade
(Batch 7). Provider-agnostic: the concrete model is whatever `LLM_PROVIDER` selects
(`get_chat_model("smart")` → gpt-4o in dev / claude-sonnet-* in prod). The name is generic so it
never lies about which vendor runs.

Fail-safe contract (Sacred rule #4): the LLM's raw output is NEVER trusted directly. Structured
output forces the shape, but this adapter re-validates it independently — ANY parsing error,
missing/invalid field, out-of-range confidence, unrecognized `decision`, or client
exception/timeout degrades to `uncertain` (which leaves the product UNCLASSIFIED upstream). There
is no code path that can turn an error into `match`. The model is dependency-injected so tests
never touch the real client or burn tokens.
"""
from __future__ import annotations

import logging
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from src.shared.llm import get_chat_model

from ..llm_circuit_breaker import LlmCircuitBreaker
from ...domain.classification import CategoryVerdict, ClassifiableProduct

logger = logging.getLogger(__name__)

# Patrón cuadra-agent-prompts: instrucciones en INGLÉS, structured output forzado. Nunca le pedimos
# que invente una categoría — solo que juzgue si el producto pertenece a la categoría dada.
_PROMPT = """You are classifying a supermarket product into a product category taxonomy. Decide
whether the given product BELONGS to the candidate category. Use ONLY the fields given — do not
invent facts.

Product (seen at ingestion time):
  name="{name}", brand="{brand}", size="{size}"

Candidate category (a taxonomy subcategory):
  "{candidate}"

Decide "match" only if you are confident the product belongs to this category. Decide "no_match" if
you are confident it does not. Decide "uncertain" if the fields are ambiguous or insufficient.

List exactly which product cues you used (e.g. "name mentions rice", "brand is a beer brand"). Do
NOT output a price or any number other than your confidence (0.0-1.0)."""


class _Verdict(BaseModel):
    """Structured-output schema handed to `with_structured_output`."""

    decision: Literal["match", "no_match", "uncertain"]
    confidence: float = Field(ge=0.0, le=1.0)
    cited_fields: list[str]


class StructuredChatModel(Protocol):
    """Shape needed from the injected client — matches
    `get_chat_model(...).with_structured_output(_Verdict, include_raw=True)`."""

    def invoke(self, prompt: str) -> dict[str, Any]: ...


_UNCERTAIN = CategoryVerdict(decision="uncertain", confidence=0.0, cited_fields=[])


class CategoryJudge:
    """Adapter around the LLM judge for the grey-band classification step."""

    def __init__(
        self,
        model: StructuredChatModel | None = None,
        *,
        circuit_breaker: LlmCircuitBreaker | None = None,
    ) -> None:
        # max_retries=0: fallo instantáneo si el LLM está caído (sin backoff), para que el breaker
        # corte rápido (mismo patrón que LlmJudge).
        self._model = model or get_chat_model("smart", max_retries=0).with_structured_output(
            _Verdict, include_raw=True
        )
        # Corta el retry-storm si el LLM está caído/sin cuota (mismo patrón que LlmJudge).
        self._breaker = circuit_breaker or LlmCircuitBreaker()

    def judge(self, product: ClassifiableProduct, candidate_name: str) -> CategoryVerdict:
        prompt = _PROMPT.format(
            name=product.name or "—",
            brand=product.brand or "—",
            size=product.size_text or "—",
            candidate=candidate_name,
        )

        if self._breaker.is_open:
            return _UNCERTAIN

        try:
            result = self._model.invoke(prompt)
            self._breaker.record_success()
        except Exception:
            self._breaker.record_failure()
            logger.warning("category_judge: client call failed, degrading to uncertain", exc_info=True)
            return _UNCERTAIN

        if not isinstance(result, dict):
            return _UNCERTAIN
        if result.get("parsing_error") is not None or result.get("parsed") is None:
            logger.warning("category_judge: unparseable output, degrading to uncertain")
            return _UNCERTAIN

        parsed = result["parsed"]
        payload = parsed.model_dump() if isinstance(parsed, BaseModel) else (
            parsed.model_dump() if hasattr(parsed, "model_dump") else parsed
        )
        try:
            verdict = _Verdict.model_validate(payload)
        except ValidationError:
            logger.warning("category_judge: schema validation failed, degrading to uncertain")
            return _UNCERTAIN

        return CategoryVerdict(
            decision=verdict.decision,
            confidence=verdict.confidence,
            cited_fields=verdict.cited_fields,
        )

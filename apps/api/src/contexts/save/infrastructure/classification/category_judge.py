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


def _uncertain_with(usage: dict[str, Any] | None) -> CategoryVerdict:
    """Fail-safe que igual reporta el costo cuando SÍ se gastaron tokens (la llamada salió bien
    pero la salida era ilegible). Pagar y no poder confiar en lo que volvió no son contradictorios:
    es la lectura honesta del gasto."""
    if usage is None:
        return _UNCERTAIN
    return CategoryVerdict(
        decision="uncertain", confidence=0.0, cited_fields=[],
        input_tokens=usage.get("input_tokens"),
        output_tokens=usage.get("output_tokens"),
        model=usage.get("model"),
    )


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
        # Tier `fast`, NO `smart` — decidido con un A/B, no por ahorrar a ciegas.
        #
        # Medido 2026-08-01 sobre 119 pares reales de banda gris, los mismos por los dos modelos:
        # **96% de acuerdo en el desenlace** (asigna la hoja o no). Y de los 5 desacuerdos, `fast`
        # acierta 3, `smart` 1 y uno es discutible:
        #   · `CREMA PROTECTORA PAÑAL` → «Cuidado Prenatal»: smart asigna, fast rechaza (fast bien)
        #   · `SAL CEBOLLA` → «Condimentos»: fast asigna, smart duda (fast bien)
        #   · `Galleta Arroz Baby Mum-Mum` → «Arroz, Granos»: smart asigna (MAL — es el error del
        #     ingrediente que el subsistema combate; fast lo rechaza)
        #   · `JAMON PECHUGA PAVO` → «Jamón»: smart asigna (bien), fast rechaza
        #
        # O sea que el modelo caro no era más preciso acá: la tarea es un sí/no sobre un texto
        # corto contra UNA categoría candidata, no razonamiento abierto. Y este juez es el que más
        # llama del subsistema (147 clasificaciones contra 12 del de matching).
        #
        # El juez de MATCHING sigue en `smart` a propósito: no se midió, su desenlace es un
        # auto-enlace (más caro de equivocar) y son ~6 llamadas por corrida — no hay ahorro que
        # justifique el riesgo. Re-medir con `seeds.ab_judge_tier` antes de tocarlo.
        self._model = model or get_chat_model("fast", max_retries=0).with_structured_output(
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

        # Se lee ANTES de validar la salida: la llamada ya se pagó aunque la respuesta no sirva, y
        # si no se contara acá el gasto quedaría subestimado justo en el camino que más falla.
        usage = self._read_usage(result.get("raw"))

        if result.get("parsing_error") is not None or result.get("parsed") is None:
            logger.warning("category_judge: unparseable output, degrading to uncertain")
            return _uncertain_with(usage)

        parsed = result["parsed"]
        payload = parsed.model_dump() if isinstance(parsed, BaseModel) else (
            parsed.model_dump() if hasattr(parsed, "model_dump") else parsed
        )
        try:
            verdict = _Verdict.model_validate(payload)
        except ValidationError:
            logger.warning("category_judge: schema validation failed, degrading to uncertain")
            return _uncertain_with(usage)

        return CategoryVerdict(
            decision=verdict.decision,
            confidence=verdict.confidence,
            cited_fields=verdict.cited_fields,
            input_tokens=usage.get("input_tokens") if usage else None,
            output_tokens=usage.get("output_tokens") if usage else None,
            model=usage.get("model") if usage else None,
        )

    @staticmethod
    def _read_usage(raw: Any) -> dict[str, Any] | None:
        """Metadata de uso de la respuesta. `None` cuando no hay nada que reportar.

        Provider-agnóstico: langchain-openai expone el modelo en `model_name` y langchain-anthropic
        en `model` — leer sólo uno dejaba el campo en 'unknown' con el otro proveedor (mismo bug ya
        corregido en `llm_judge`).
        """
        usage = getattr(raw, "usage_metadata", None) if raw is not None else None
        if not usage:
            return None
        metadata = getattr(raw, "response_metadata", {}) or {}
        return {
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "model": metadata.get("model_name") or metadata.get("model") or "unknown",
        }

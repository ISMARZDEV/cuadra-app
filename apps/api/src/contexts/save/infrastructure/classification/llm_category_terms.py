"""Adapter LLM que genera los descriptores del dominio de una hoja de taxonomía — OFFLINE.

Produce los `classification_terms` que alimentan la receta de embedding del clasificador
(`build_category_embedding_text`): ejemplos concretos de productos que pertenecen a la categoría
("arroz, habichuelas, guandules"). Corre UNA vez (CLI seed), no en la ingesta caliente.

Provider-agnóstico (`get_chat_model("fast")` → gpt-4o-mini en dev / claude-haiku en prod): la tarea
es enumeración de vocabulario, barata → tier "fast". Patrón `cuadra-agent-prompts`: instrucciones en
INGLÉS, structured output forzado. **Fail-safe**: cualquier error de cliente, parseo o lista vacía
degrada a "" — el use-case salta la hoja (NUNCA persiste basura ni inventa descriptores).

El modelo es dependency-injected → los tests nunca tocan el cliente real ni queman cuota.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

from pydantic import BaseModel, Field

from src.shared.llm import get_chat_model

logger = logging.getLogger(__name__)

# Instrucciones en INGLÉS; los EJEMPLOS que se piden van en ESPAÑOL (el catálogo es dominicano) —
# el mercado y las marcas (Presidente, Brugal, La Famosa) son locales. No se pide inventar hechos:
# solo enumerar productos típicos de la subcategoría, con términos y marcas que un comprador usaría.
_PROMPT = """You are enriching a supermarket product-category taxonomy for the Dominican Republic.

Given a category, list 6 to 14 SHORT example terms of products that belong to it: common product
words, generic types, and well-known LOCAL brands a shopper would recognize. Write the terms in
SPANISH. Do NOT include prices, sizes, or explanations — only the example terms.

Parent category: "{parent}"
Subcategory to describe: "{leaf}"

Return ONLY the list of example terms."""


class _Terms(BaseModel):
    """Structured-output schema handed to `with_structured_output`."""

    terms: list[str] = Field(default_factory=list)


class StructuredChatModel(Protocol):
    """Shape needed from the injected client — matches
    `get_chat_model(...).with_structured_output(_Terms, include_raw=True)`."""

    def invoke(self, prompt: str) -> dict[str, Any]: ...


class LlmCategoryTermsGenerator:
    def __init__(self, model: StructuredChatModel | None = None) -> None:
        self._model = model or get_chat_model("fast", max_retries=0).with_structured_output(
            _Terms, include_raw=True
        )

    def generate(self, leaf_name: str, parent_name: str | None) -> str:
        prompt = _PROMPT.format(parent=parent_name or "—", leaf=leaf_name)
        try:
            result = self._model.invoke(prompt)
            if result.get("parsing_error"):
                logger.warning("category-terms parse error for %r: %s", leaf_name, result["parsing_error"])
                return ""
            parsed = result.get("parsed")
            terms = [t.strip() for t in (getattr(parsed, "terms", None) or []) if t and t.strip()]
            return ", ".join(terms)
        except Exception:  # noqa: BLE001 — fail-safe: NUNCA propaga; sin términos = reintentar luego
            logger.exception("category-terms generation failed for %r", leaf_name)
            return ""

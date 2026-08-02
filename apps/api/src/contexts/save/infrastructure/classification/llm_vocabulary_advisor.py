"""Adapter LLM que propone a qué hoja debería pertenecer un token mal mapeado.

Provider-agnóstico (`get_chat_model("fast")` → gpt-4o-mini en dev / claude-haiku en prod). Se usa
`fast` y no `smart` a propósito: la pregunta es una elección semántica sobre un menú CERRADO de
hojas, no un razonamiento abierto — y corre offline sobre unas decenas de tokens, no por producto.

QUÉ se le pregunta, y por qué es una pregunta que sí sabe responder: **no** "¿este token es bueno?"
—eso lo decide la medición sobre el corpus, que el modelo no ve— sino "de estas hojas concretas,
¿cuál debería quedarse con este token?". Juicio semántico sobre opciones dadas.

Fail-safe (regla sagrada #4): cualquier error de parseo, respuesta fuera del menú, o excepción del
cliente devuelve `None` = "no sé". No hay camino que convierta un fallo en una propuesta. Y aunque
el modelo devuelva una hoja válida, `ProposeVocabularyFixes` todavía la valida contra la raíz que
midió el corpus antes de emitirla.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

from pydantic import BaseModel, ValidationError

from src.shared.llm import get_chat_model

logger = logging.getLogger(__name__)

# Patrón cuadra-agent-prompts: instrucciones en INGLÉS, datos en español. Se le prohíbe
# explícitamente inventar una hoja fuera del menú — y aun así se valida la respuesta al volver.
_PROMPT = """A keyword from a Dominican supermarket taxonomy is attached to the wrong category leaf.

Keyword: "{token}"
Currently attached to: "{current_leaf}"

Candidate leaves (choose EXACTLY ONE by its number, or 0 if none fits):
{options}

Which leaf should own this keyword? Answer with the NUMBER only. Choose 0 rather than forcing a
poor fit — a wrong answer is worse than no answer. Do NOT invent a leaf that is not listed."""


class _Choice(BaseModel):
    choice: int


class StructuredChatModel(Protocol):
    def invoke(self, prompt: str) -> dict[str, Any]: ...


class LlmVocabularyAdvisor:
    def __init__(self, model: StructuredChatModel | None = None) -> None:
        self._model = model or get_chat_model("fast", max_retries=0).with_structured_output(
            _Choice, include_raw=True
        )

    def suggest_leaf(
        self, *, token: str, current_leaf: str, candidate_leaves: list[tuple[str, str]]
    ) -> str | None:
        if not candidate_leaves:
            return None
        opciones = "\n".join(
            f"  {i}. {name}" for i, (_id, name) in enumerate(candidate_leaves, start=1)
        )
        prompt = _PROMPT.format(token=token, current_leaf=current_leaf, options=opciones)

        try:
            result = self._model.invoke(prompt)
        except Exception:  # noqa: BLE001 — fail-safe: sin respuesta útil no se propone nada
            logger.warning("llm_vocabulary_advisor: fallo del cliente", exc_info=True)
            return None

        parsed = result.get("parsed") if isinstance(result, dict) else None
        error = result.get("parsing_error") if isinstance(result, dict) else "sin dict"
        if error is not None or parsed is None:
            logger.warning("llm_vocabulary_advisor: salida ilegible")
            return None

        try:
            elegido = _Choice.model_validate(
                parsed.model_dump() if isinstance(parsed, BaseModel) else parsed
            ).choice
        except ValidationError:
            return None

        # 0 = "ninguna encaja", que es una respuesta legítima y preferible a forzar una mala.
        # Cualquier índice fuera de rango se trata igual que no saber.
        if not 1 <= elegido <= len(candidate_leaves):
            return None
        return candidate_leaves[elegido - 1][0]

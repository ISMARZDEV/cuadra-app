"""Router del orquestador (§7.1, §7.8): clasifica la intención del mensaje.

Dos capas (patrón Cleo/reuso): **cortocircuitos deterministas** primero (regex de gasto +
dígito → barato, sin LLM) y, si no, un **clasificador LLM** con structured output. El
clasificador es inyectable (un `Callable`) → tests deterministas con un fake.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import Literal

from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from src.shared.llm import get_chat_model

Classifier = Callable[[str, list[str]], str]  # (texto, capabilities) -> intent

_EXPENSE_RE = re.compile(r"\b(gast|gaste|gasté|pagu|pagué|compr)", re.IGNORECASE)


def make_classify_intent(classifier: Classifier):  # type: ignore[no-untyped-def]
    """Nodo `classify_intent`: cortocircuito → si no, el clasificador inyectado."""

    def classify_intent(state: dict) -> dict:
        text = state["messages"][-1].content
        if _EXPENSE_RE.search(text) and any(c.isdigit() for c in text):
            return {"intent": "register_expense"}
        return {"intent": classifier(text, state.get("capabilities", []))}

    return classify_intent


class _IntentOut(BaseModel):
    intent: Literal["register_expense", "query_metrics", "other"]


def llm_classifier(text: str, capabilities: list[str]) -> str:
    """Real classifier (cheap LLM, structured output). English prompt — cuadra-agent-prompts skill."""
    model = get_chat_model("fast")
    out = model.with_structured_output(_IntentOut).invoke(
        [HumanMessage(f"Classify the user's financial intent: {text!r}")]
    )
    return out.intent

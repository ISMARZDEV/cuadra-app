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
    intent: Literal["register_expense", "query_metrics", "general"]


# English prompt (cuadra-agent-prompts skill). `general` is the CONVERSATIONAL bucket (greetings,
# smalltalk, thanks, off-topic) — handled by the GeneralAgent, NOT the canned respond_other.
_CLASSIFY_PROMPT = """Classify the user's message into ONE intent for a personal-finance assistant.

- register_expense — the user reports money moving (spent, paid, bought, got paid, earned).
- query_metrics — the user asks about their money (balance, how much spent, safe to spend, budget).
- general — greetings, small talk, thanks, how-are-you, or anything not about their own finances.

Message: {text!r}"""


def llm_classifier(text: str, capabilities: list[str]) -> str:
    """Real classifier (cheap LLM, structured output). English prompt — cuadra-agent-prompts skill."""
    model = get_chat_model("fast")
    out = model.with_structured_output(_IntentOut).invoke(
        [HumanMessage(_CLASSIFY_PROMPT.format(text=text))]
    )
    return out.intent

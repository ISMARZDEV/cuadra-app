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

# `compr` queda FUERA a propósito: nombra dos intenciones opuestas — «compré» (gasto pasado) y
# «la compra / comprar» (ir al súper). Un token que matchea dos clases no discrimina ninguna, así
# que esas frases las decide el clasificador, que sí lee tiempo verbal y contexto.
_EXPENSE_RE = re.compile(r"\b(gast|gaste|gasté|pagu|pagué)", re.IGNORECASE)


def make_classify_intent(classifier: Classifier):  # type: ignore[no-untyped-def]
    """Nodo `classify_intent`: cortocircuito → si no, el clasificador inyectado."""

    def classify_intent(state: dict) -> dict:
        text = state["messages"][-1].content
        if _EXPENSE_RE.search(text) and any(c.isdigit() for c in text):
            return {"intent": "register_expense"}
        return {"intent": classifier(text, state.get("capabilities", []))}

    return classify_intent


class _IntentOut(BaseModel):
    # El `Literal` + Pydantic hacen IMPOSIBLE un intent inválido: el tipo cierra la puerta que el
    # prompt solo pediría amablemente. Añadir un agente = un valor más acá y una línea en el prompt.
    intent: Literal["register_expense", "query_metrics", "general", "groceries"]


# English prompt (cuadra-agent-prompts skill). `general` is the CONVERSATIONAL bucket (greetings,
# smalltalk, thanks, off-topic) — handled by the GeneralAgent, NOT the canned respond_other.
_CLASSIFY_PROMPT = """Classify the user's message into ONE intent for a personal-finance assistant.

- register_expense — the user reports money that ALREADY moved (spent, paid, bought, got paid).
- query_metrics — the user asks about THEIR OWN money: balance, how much they have spent, how much
  they CAN still spend today, whether they are on budget, safe-to-spend.
- groceries — the user asks about SUPERMARKET PRICES or planning a shopping trip: where a product
  is cheapest, what something costs in stores, comparing supermarkets, building a shopping list,
  or what fits in a budget at the supermarket.
- general — greetings, small talk, thanks, or anything else.

BOUNDARY — register_expense vs groceries. The tense decides, not the words:
- "gasté 500 comprando arroz" → register_expense (money ALREADY left their pocket)
- "con RD$10,000 qué me alcanza para la compra" → groceries (planning a FUTURE purchase)
- "quiero comprar pollo, cuál está más barato" → groceries (asking about prices, has not bought)

BOUNDARY — query_metrics vs groceries. Whose money is it:
- "cuánto gasté en el súper este mes" → query_metrics (THEIR spending)
- "cuánto puedo gastar hoy" → query_metrics (THEIR budget, no product involved)
- "cuánto cuesta la compra del mes" → groceries (the STORE's prices)

Message: {text!r}"""


def llm_classifier(text: str, capabilities: list[str]) -> str:
    """Real classifier (cheap LLM, structured output). English prompt — cuadra-agent-prompts skill."""
    model = get_chat_model("fast")
    out = model.with_structured_output(_IntentOut).invoke(
        [HumanMessage(_CLASSIFY_PROMPT.format(text=text))]
    )
    return out.intent

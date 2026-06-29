"""LLM category suggestions for the register-expense flow (Img 10 — "según tu tipo de gasto").

Called EXACTLY once per flow (memoized by the flow's `prepare`), so it costs a single structured
LLM call. Given the staged expense (merchant / category / amount) it returns 2-3 {value, icon}
suggestions in the user's language. Robust: on any failure it falls back to the category the staging
LLM already picked, so it NEVER blocks the flow. Kept free of `src.shared.lang` (lingua) so it stays
unit-testable by mocking the model.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from src.shared.llm import get_chat_model

# Patrón cuadra-agent-prompts: instrucciones en inglés, NOMBRES de categoría en el idioma del usuario
# (son user-facing → se muestran como chips).
_PROMPT = """Suggest 2-3 spending categories for this expense, each with ONE emoji and a vivid ring
color that fits it. Expense: merchant="{merchant}", current category="{category}", amount={amount}.
Write the category names in {language}, short (1-2 words), DISTINCT, ranked most-likely first."""

_LANG = {"es": "Spanish", "en": "English", "pt": "Portuguese"}


class _Suggestion(BaseModel):
    name: str = Field(description="short category name, in the user's language")
    icon: str = Field(description="a single emoji representing the category")
    color: str = Field(description="a vivid hex color (#RRGGBB) that fits the category, for its ring")


class _Suggestions(BaseModel):
    items: list[_Suggestion]


def suggest_expense_categories(state: dict) -> list[dict]:
    pa = state.get("pending_action") or {}
    language = _LANG.get((state.get("language") or "es")[:2].lower(), "Spanish")
    try:
        model = get_chat_model("fast").with_structured_output(_Suggestions)
        result = model.invoke(
            _PROMPT.format(
                merchant=pa.get("merchant") or "—",
                category=pa.get("category") or "—",
                amount=pa.get("amount"),
                language=language,
            )
        )
        out = [
            {"value": s.name.strip(), "icon": s.icon, "color": s.color}
            for s in result.items[:3]
            if s.name.strip()
        ]
        if out:
            return out
    except Exception:  # noqa: BLE001 — categorías son un nice-to-have; nunca bloquean el flujo
        pass
    staged = (pa.get("category") or "").strip()
    return [{"value": staged, "icon": "💸", "color": "#16A34A"}] if staged else []

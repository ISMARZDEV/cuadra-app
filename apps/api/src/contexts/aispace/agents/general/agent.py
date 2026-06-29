"""GeneralAgent — la conversación de AISpace (saludos, smalltalk, reconducción a finanzas).

A diferencia del FinanceAgent (ReAct con tools), conversar NO necesita tools: una llamada LLM
simple basta y es más barata (tier `fast`). `run()` devuelve la respuesta del modelo SIN
`pending_action` (no escribe → sin HITL); `commit()` es no-op.

La PERSONALIDAD es configurable (estilo Cleo §6): el prompt inyecta el idioma (`{language}`) y
una de las 3 variantes de tono (`{personality}` — Neutro/Coach/Roast), igual que el patrón de
`FINANCE_PROMPT`. Instrucciones en INGLÉS, respuesta en el idioma del usuario (skill
`cuadra-agent-prompts`). Las BOUNDARIES mantienen la identidad de copiloto financiero (no es un
chatbot general). El modelo es inyectable para tests deterministas (sin LLM real).
"""
from __future__ import annotations

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage

from src.contexts.aispace.preferences.enums import DEFAULT_PERSONALITY, Personality
from src.shared.lang import language_name
from src.shared.llm import get_chat_model

# Bloque de tono por personalidad (lo único que cambia entre modos). Inglés; el emoji es parte
# del estilo, no del idioma. Roast siempre "kind underneath" — evita el riesgo de tono (FTC §8).
_PERSONALITY_BLOCKS: dict[Personality, str] = {
    Personality.NEUTRAL: (
        "Speak clearly and warmly, like a calm, professional advisor. No jokes, no sarcasm, "
        "no emoji. Be plain-spoken and encouraging."
    ),
    Personality.COACH: (
        "You are an upbeat money coach. Be warm, motivating and a little playful. Celebrate good "
        "habits and small wins, and nudge the user toward their goals with energy. A light emoji "
        "is fine (use it sparingly)."
    ),
    Personality.ROAST: (
        "You are a witty, sassy money coach with sharp but friendly humor. Tease the user about "
        "silly spending with light sarcasm and roast their bad money habits — but you are ALWAYS "
        "kind and supportive underneath, NEVER cruel or insulting. Land the joke, then point them "
        "somewhere useful. A cheeky emoji is fine."
    ),
}

_GENERAL_PROMPT = """# LANGUAGE — TOP PRIORITY
Reply EXCLUSIVELY in {language}. These instructions are in English, but every reply you send the
user MUST be written in {language}.

# ROLE
You are AISpace, Cuadra's friendly financial copilot. You chat with the user briefly (1-3
sentences). You can greet, make small talk, and answer light questions, but you gently steer the
conversation back to their money — budgeting, expenses, saving, prices.

# PERSONALITY
{personality}

# BOUNDARIES
- You are NOT a general-purpose assistant. For requests unrelated to personal finance, acknowledge
  kindly and redirect to what you CAN do: track their spending and income, show their balance, and
  tell them what's safe to spend.
- NEVER invent financial figures or amounts. If the user wants to log or check money, tell them
  you'll help and let the finance flow take over (the system routes that).
- Keep it short. No walls of text.
"""


def _coerce_personality(value: object) -> Personality:
    """Estado → Personality, tolerante (string del request, enum, o ausente → default COACH)."""
    if isinstance(value, Personality):
        return value
    try:
        return Personality(str(value))
    except ValueError:
        return DEFAULT_PERSONALITY


class GeneralAgent:
    intents = ("general",)

    def __init__(self, *, model: BaseChatModel | None = None, model_tier: str = "fast") -> None:
        self._model = model
        self._tier = model_tier

    def _chat_model(self) -> BaseChatModel:
        # temperatura > 0: conversar quiere calidez/variedad (no es routing determinista).
        return self._model or get_chat_model(self._tier, temperature=0.7)

    def run(self, state: dict) -> dict:
        lang = language_name(state.get("language", "es"))
        personality = _coerce_personality(state.get("personality"))
        prompt = _GENERAL_PROMPT.format(
            language=lang, personality=_PERSONALITY_BLOCKS[personality]
        )
        reply = self._chat_model().invoke([SystemMessage(prompt), *state["messages"]])
        return {"messages": [reply], "pending_action": None}

    def commit(self, state: dict) -> str:  # pragma: no cover - no escribe nada
        return ""

"""FinanceAgent v2 — ReAct (`create_agent`): el LLM ELIGE entre registrar y consultar.

`run()` corre el agente ReAct con sus tools (lectura inmediata; escritura STAGEA para el
HITL) y devuelve los mensajes nuevos + la acción staged. `commit()` ejecuta esa acción ya
confirmada. Las tools se construyen por invocación con `user_id` (del estado/JWT) ligado por
closure (anti-IDOR §12.1) — el modelo nunca recibe el user_id. (Migración desde el v1
determinista: ahora hay 2 tools y el LLM decide cuál usar.)
"""
from __future__ import annotations

from langchain.agents import create_agent

from src.shared.i18n import t
from src.shared.lang import language_name
from src.shared.llm import get_chat_model

from .tools.metrics import build_get_monthly_summary, build_get_safe_to_spend
from .tools.transactions import (
    FinanceToolError,
    SessionFactory,
    build_stage_register_transaction,
    execute_register_transaction,
)

# Patrón `cuadra-agent-prompts` (skill): instrucciones en INGLÉS (mejor adherencia, −24% tokens,
# estable multi-turno), respuesta en el idioma del usuario inyectado como valor concreto. Ver §7.11.
FINANCE_PROMPT = """# LANGUAGE — TOP PRIORITY
Reply EXCLUSIVELY in {language}. These instructions are in English, but every reply you send the
user MUST be written in {language}.

# ROLE
You are Cuadra's finance assistant. You log the user's expenses and income and explain how their
money is doing. Be warm, concise, and clear.

# TOOLS — pick exactly one
- register_transaction — the user spent or earned money (a WRITE; the system asks them to confirm).
- get_monthly_summary — "how am I doing / my balance / how much have I spent" (READ).
- get_safe_to_spend — "how much can I spend today / am I on budget / safe to spend" (READ).

# LOGGING A TRANSACTION (register_transaction)
- Call it whenever the user reports money moving. Set kind="expense" (spent/paid/bought) or
  kind="income" (got paid/earned/received: salary, freelance...).
- Pass currency ONLY if the user names it, as an ISO 4217 code (dollars→USD, colombian pesos→COP,
  reais→BRL); otherwise leave it null (the default wallet is used).
- ALWAYS call register_transaction FIRST — that tool call is what stages the expense; without it
  nothing happens. Calling it does NOT apply anything: it PREPARES the action and the SYSTEM asks the
  user Yes/No. One write tool per turn; you MUST NOT ask "shall I confirm?" in prose.
- THEN (after the tool call) add a SHORT coach reaction (1-2 sentences), matched to how notable the
  spend is: genuinely SURPRISED/emphatic for a big or unusual amount ("Wow!! 🫣 eso es mucho"), calm
  for a routine one — don't cry wolf on small spends. Do NOT say it's registered (it is NOT yet — the
  user still confirms).

# READING (get_monthly_summary / get_safe_to_spend)
Explain the figures the tool returns in natural language. NEVER invent or recompute amounts, and
do not expose internal IDs.

# EXAMPLES
- "gasté 500 en gasolina" → register_transaction(kind="expense", amount=500, category="Gasolina")
- "me pagaron 20000 de salario" → register_transaction(kind="income", amount=20000, category="Salario")
- "how much can I spend today?" → get_safe_to_spend()
"""


class FinanceAgent:
    intents = ("register_expense", "query_metrics")

    def __init__(self, session_factory: SessionFactory, *, model_tier: str = "fast") -> None:
        self._sf = session_factory
        self._tier = model_tier

    def run(self, state: dict) -> dict:
        user_id = state["user_id"]
        lang = language_name(state.get("language", "es"))
        staging: dict = {}
        tools = [
            build_get_monthly_summary(user_id, self._sf),       # lectura: resumen del mes
            build_get_safe_to_spend(user_id, self._sf),         # lectura: cuánto puedo gastar hoy
            build_stage_register_transaction(staging),          # escritura → stage (HITL)
        ]
        agent = create_agent(
            get_chat_model(self._tier), tools,
            system_prompt=FINANCE_PROMPT.format(language=lang),
        )
        result = agent.invoke(
            {"messages": state["messages"]}, {"recursion_limit": 8}
        )
        new_messages = result["messages"][len(state["messages"]):]  # solo lo que añadió el agente
        return {"messages": new_messages, "pending_action": staging.get("action")}

    def commit(self, state: dict) -> str:
        action = state["pending_action"]
        lang = state.get("language", "es")
        try:
            r = execute_register_transaction(
                state["user_id"], self._sf,
                amount=action["amount"], category=action["category"],
                kind=action.get("kind", "expense"),
                merchant=action.get("merchant"), currency=action.get("currency"),
            )
        except FinanceToolError as exc:  # sin wallet/moneda → mensaje localizado, no crash
            return t(exc.code, lang, **exc.params)
        return t(
            "registered", lang,
            display=r["display"], category=r["category"], wallet=r["wallet"],
        )

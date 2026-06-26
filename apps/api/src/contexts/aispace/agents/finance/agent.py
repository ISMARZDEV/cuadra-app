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

from .tools.metrics import build_get_monthly_summary
from .tools.transactions import (
    FinanceToolError,
    SessionFactory,
    build_stage_register_transaction,
    execute_register_transaction,
)

# El idioma se inyecta con un VALOR CONCRETO (no una regla vaga) — un modelo chico obedece
# "responde en English" mucho mejor que "responde en el idioma del usuario" (investigado).
FINANCE_PROMPT = """# IDIOMA (prioridad sobre TODO)
Responde EXCLUSIVAMENTE en {language}. Aunque estas instrucciones y las tools estén en español,
tu respuesta al usuario va SIEMPRE en {language}.

Eres el asistente de finanzas de Cuadra. Ayudas al usuario a registrar gastos y a entender cómo va
su dinero. Cálido y claro.

# REGISTRAR UN GASTO (el usuario dice que gastó / pagó / compró algo)
- DEBES llamar la tool `register_transaction` con el monto y la categoría extraídos. SIEMPRE.
- Si el usuario menciona la MONEDA (dólares, pesos colombianos, yenes…), pásala en `currency`
  como código ISO (USD, COP, JPY). Si no la menciona, déjala en null.
- La tool NO aplica el gasto al instante: lo PREPARA y el SISTEMA le pedirá al usuario la
  confirmación (Sí/No). Por eso:
  · NUNCA pidas tú la confirmación en prosa ("¿confirmas?", "¿procedo?") — eso lo hace el
    sistema cuando llamas la tool. Si no llamas la tool, NO pasa NADA.
  · NUNCA digas que registraste un gasto si no llamaste la tool.
- Una sola tool de escritura por turno.

# CONSULTAR (cómo va, balance, cuánto lleva gastado)
- Usa `get_monthly_summary`. Es lectura: explica las cifras que devuelve, natural.

# REGLAS
- Las tools devuelven cifras YA calculadas: NUNCA inventes ni recalcules montos. No expongas IDs.
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
            build_get_monthly_summary(user_id, self._sf),       # lectura inmediata
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
                merchant=action.get("merchant"), currency=action.get("currency"),
            )
        except FinanceToolError as exc:  # p.ej. sin wallet en esa moneda → mensaje amable, no crash
            return t("register_failed", lang, reason=str(exc))
        return t(
            "registered", lang,
            display=r["display"], category=r["category"], wallet=r["wallet"],
        )

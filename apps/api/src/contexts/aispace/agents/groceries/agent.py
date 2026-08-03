"""`GroceriesAgent` — el subagente de Save en el chat: precios de supermercado en RD.

Es de **SOLO LECTURA**, y la garantía no es el camino que tome el grafo: es que `commit()` es
no-op y **no existe ninguna tool de escritura**. El agente no tiene con qué escribir.

Cumple `AgentSpec` (`agents/base.py`), así que integrarlo cuesta tres líneas: la entrada en el
registry, el valor en el `Literal` del router y la línea en su prompt. **`graph.py` no se toca.**

Es el PRIMERO de una familia (tarjetas, préstamos, seguros, inversión). Todo lo reusable ya vive
fuera: la búsqueda híbrida, la fusión RRF y la comparación están en `save/domain` y `save/
application`; acá solo queda lo específico de la góndola.
"""
from __future__ import annotations

from langchain.agents import create_agent

from src.shared.lang import language_name
from src.shared.llm import get_chat_model

from .tools.basket import (
    build_basket_for_budget,
    build_monthly_cost,
    build_worth_second_store,
)
from .tools.catalog import (
    build_cheapest_store_by_category,
    build_compare_prices,
    build_explore_alternatives,
    build_search_groceries,
)
from .tools.catalog import SessionFactory

# Instrucciones en INGLÉS (skill `cuadra-agent-prompts`): mejor adherencia, estable multi-turno.
# El idioma de RESPUESTA se inyecta como valor concreto, nunca como regla vaga.
GROCERIES_PROMPT = """# LANGUAGE — TOP PRIORITY
Reply EXCLUSIVELY in {language}. These instructions are in English, but every reply you send the
user MUST be written in {language}.

# ROLE
You are Cuadra's groceries assistant for the Dominican Republic. You help people see what things
actually cost at the supermarket and decide what suits them. Be warm, concise and concrete.

# GROUNDING — these rules are ABSOLUTE
- Every price, total, unit price, store name and URL you mention MUST come verbatim from a tool
  result. NEVER compute, estimate, convert or round a number yourself.
- If a tool returns `no_match` or `no_data`, say so plainly. NEVER invent a product or a price.
- If a product is sold at only ONE store, say "I found it at X". Do NOT say "X has the best price"
  — with nothing to compare against, that claim is false.
- Include the store link ONLY when the tool returned a `url=` for that store, and copy it exactly.
  If the tool gave no url, name the store WITHOUT a link. NEVER build a link from the store's name,
  and never guess a homepage — a fabricated link is a fabricated fact.
- Always say when the price was captured and that online prices may differ in store.

# FRAMING — every comparative claim must be CONDITIONED, never absolute
Make explicit: which stores you compared, the date of the data, the axis (absolute price vs price
per unit), and what you did NOT evaluate (quality, taste, freshness, distance).
Say "among the 3 stores I have, as of Aug 2, the cheapest is X" — never "X is the cheapest".
An honest frame turns a limitation into credibility; an absolute claim turns the same limitation
into an error the user will catch.

# TOOLS — pick the one that matches the QUESTION
- search_groceries — you need to know WHICH products exist before anything else.
- compare_prices — the price of ONE product, or where it is cheapest.
- explore_alternatives — other sizes or options ("is the big package worth it?").
- basket_for_budget — an AMOUNT of money plus a whole shopping trip ("with RD$10,000, what can I
  buy?"). This is the flagship question.
- cheapest_store_by_category — which supermarket is cheaper for a whole category.
- monthly_cost — what one household group costs (baby, cleaning, coffee).
- worth_second_store — is a second stop worth it.

# WHEN IT IS NOT YOUR TURN
If the user asks about THEIR OWN money — how much they spent, their balance, their budget — say
plainly that you handle supermarket prices and that their spending lives in the Insights section.
Do NOT try to answer it with catalog data.

# LENGTH — STRICT
2-4 short sentences plus the figures. No lists unless the user asked for a list. No filler.
"""


class GroceriesAgent:
    intents = ("groceries",)

    def __init__(self, session_factory: SessionFactory, market_id: str = "DO", *,
                 model_tier: str = "fast") -> None:
        self._sf = session_factory
        self._market = market_id
        self._tier = model_tier

    def run(self, state: dict) -> dict:
        lang = language_name(state.get("language", "es"))
        # Las tools se construyen POR INVOCACIÓN con el mercado ligado por closure: el modelo no
        # puede pedir el catálogo de otro país (§5.1). Ninguna escribe.
        tools = [
            build_search_groceries(self._sf, self._market),
            build_compare_prices(self._sf, self._market),
            build_explore_alternatives(self._sf, self._market),
            build_basket_for_budget(self._sf, self._market),
            build_cheapest_store_by_category(self._sf, self._market),
            build_monthly_cost(self._sf, self._market),
            build_worth_second_store(self._sf, self._market),
        ]
        agent = create_agent(
            get_chat_model(self._tier),
            tools,
            system_prompt=GROCERIES_PROMPT.format(language=lang),
        )
        result = agent.invoke({"messages": state["messages"]}, {"recursion_limit": 10})
        new_messages = result["messages"][len(state["messages"]):]
        return {"messages": new_messages, "pending_action": None}

    def commit(self, state: dict) -> str:
        """No-op: este agente es de SOLO LECTURA y no tiene ninguna tool de escritura."""
        return ""

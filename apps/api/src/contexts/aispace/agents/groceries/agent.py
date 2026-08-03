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
from .tools._shared import basket_action, product_action
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
- `found_several` is the OPPOSITE of `no_match`: it means the catalog has MANY matches and the app
  is already showing the user a picker. Reply with one short line saying you found several options;
  do NOT list them, do NOT ask which one (the picker asks), and NEVER say you found nothing.
- If a product is sold at only ONE store, say "I found it at X". Do NOT say "X has the best price"
  — with nothing to compare against, that claim is false.
- NEVER paste a URL into your reply, and never list every store's price line by line for ONE
  product: the app already renders a comparison CARD under your text, with the photo, each
  store and its price. Say the headline in words and let the card carry the table.
- Always say when the price was captured and that online prices may differ in store.

# FRAMING — every comparative claim must be CONDITIONED, never absolute
Make explicit: which stores you compared, the date of the data, the axis (absolute price vs price
per unit), and what you did NOT evaluate (quality, taste, freshness, distance).
Say "among the 3 stores I have, as of Aug 2, the cheapest is X" — never "X is the cheapest".
An honest frame turns a limitation into credibility; an absolute claim turns the same limitation
into an error the user will catch.

# TOOLS — pick the one that matches the QUESTION
- search_groceries — find products and show them as a carousel grouped by store ("productos para
  perro", "arroz", "detergente"). The app renders the cards; do NOT list them again in prose.
- compare_prices — the price of ONE specific product, or where it is cheapest.
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

# FORMAT — the app renders a SMALL markup. Use it, and nothing else.
Any other markdown (tables, `###`, `1.`, `>`, code fences) shows up as raw characters.

  ## Store name    section heading — one per store when you compare 2 or more
  - item           bullet — for the contents of a list
  **bold**         inline emphasis — at most ONE figure per reply

Comparing 2+ stores: one `## ` section per store, cheapest FIRST, then 1-2 short data lines
under it. Separate figures on the same line with ` · `. Never put the same figure twice.
One product, or a single fact: plain sentences, no markup at all.

For `search_groceries` (the "show me products" question): the app renders the results as a
carousel grouped by store below your text. DO NOT list the products, prices or stores in your
prose; only write a short intro, one insight line, and the freshness caveat.

For `basket_for_budget` (the "what fits in RD$X" question): the app renders a summary card
below your text with each store's groups, items, total and money left. DO NOT list those numbers
in your prose; only write a short intro, one insight line, and the freshness caveat.

Structure to follow for a basket question (write the words in {language}, this is only the SHAPE):

    With RD$10,000 here is how far it goes at the supermarkets I compared.

    Sirena stretches it by 1 more item than Nacional.

    Prices from Aug 2; they may differ in store.

# LENGTH — STRICT
Prose replies: 2-4 short sentences plus the figures. No filler, no preamble, no "Sure!".
Never dump a 20-line list unless the user asked to see the list.
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
        # Canal de STAGING para la desambiguación (§5.4·A). No es una escritura: el dock se usa
        # para ELEGIR, no para confirmar que se persista algo.
        staging: dict = {}
        # Las tools se construyen POR INVOCACIÓN con el mercado ligado por closure: el modelo no
        # puede pedir el catálogo de otro país (§5.1). Ninguna escribe.
        tools = [
            build_search_groceries(self._sf, self._market, staging),
            build_compare_prices(self._sf, self._market, staging),
            build_explore_alternatives(self._sf, self._market),
            build_basket_for_budget(self._sf, self._market, staging),
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
        return {
            "messages": new_messages,
            "pending_action": staging.get("action"),
            "ui_actions": [
                *product_action(staging.get("product")),
                *basket_action(staging.get("basket")),
                *(staging.get("provider_products") or []),
            ],
        }

    def commit(self, state: dict) -> str:
        """No-op: este agente es de SOLO LECTURA y no tiene ninguna tool de escritura."""
        return ""

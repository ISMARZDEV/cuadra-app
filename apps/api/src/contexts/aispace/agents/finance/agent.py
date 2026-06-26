"""FinanceAgent — registra gastos del usuario (primer slice, §7).

v1 = flujo DETERMINISTA (extraer → confirmar → ejecutar): el router ya clasificó la
intención; el agente extrae los args con el LLM (`plan`) y, tras el HITL, ejecuta la tool
(`execute`). Migra a `create_agent`/ReAct cuando sume tools que requieran que el LLM ELIJA
entre varias (hoy es una: register_transaction). El extractor es inyectable → tests sin LLM.
"""
from __future__ import annotations

from collections.abc import Callable

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from src.shared.llm import get_chat_model

from .tools.transactions import SessionFactory, build_register_transaction

Extractor = Callable[[str], dict]


class _ExpenseOut(BaseModel):
    amount: float = Field(description="Monto en unidades MAYORES (500 = RD$500), nunca minor")
    category: str = Field(description="Categoría corta del gasto: Gasolina, Comida, Renta…")
    merchant: str | None = Field(default=None, description="Comercio si se menciona")


def llm_extract_expense(text: str) -> dict:
    """Extractor real (LLM barato). El LLM SOLO extrae args; la aritmética va en la tool."""
    model = get_chat_model("fast")
    out = model.with_structured_output(_ExpenseOut).invoke(
        [HumanMessage(f"Extrae el gasto del mensaje: {text!r}")]
    )
    return out.model_dump()


class FinanceAgent:
    intents = ("register_expense",)

    def __init__(
        self, session_factory: SessionFactory, *, extractor: Extractor = llm_extract_expense
    ) -> None:
        self._sf = session_factory
        self._extract = extractor

    def plan(self, state: dict) -> dict:
        text = state["messages"][-1].content
        args = self._extract(text)
        return {
            "tool": "register_transaction",
            "args": args,
            "summary": f"registrar RD${args['amount']:.0f} en {args['category']}",
            "requires_confirmation": True,  # es una ESCRITURA → HITL (§7.4)
        }

    def execute(self, state: dict) -> str:
        args = state["pending_action"]["args"]
        tool = build_register_transaction(state["user_id"], self._sf)  # user_id del estado (JWT)
        r = tool(amount=args["amount"], category=args["category"], merchant=args.get("merchant"))
        return (
            f"Listo, registré RD${r['amount_minor'] / 100:,.0f} en {r['category']} "
            f"desde {r['wallet']}."
        )

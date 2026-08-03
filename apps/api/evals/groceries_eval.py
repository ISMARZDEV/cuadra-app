"""Eval del GroceriesAgent (§12) — TRAYECTORIA + FIDELIDAD sobre el LLM real.

Mide las dos cosas que un test de contenido no puede ver:

1. **Selección de tool** (§12.2, objetivo ≥90% de §9.0). Un agente puede dar una respuesta que suena
   bien habiendo llegado por el camino equivocado; eso no lo detecta ningún assert sobre el texto.
2. **Fidelidad** (§12.3, objetivo: CERO invenciones). Cada cifra y cada URL de la respuesta tiene
   que aparecer en el output crudo de alguna tool. Determinista, sin juez LLM — ver `grounding.py`.

NO es parte del gate (`make test`): pega al LLM real y cuesta dinero. Se corre a demanda:

    cd apps/api && uv run python -m evals.groceries_eval

El set está etiquetado con la tool que DEBERÍA llamarse. Donde el plan admite más de una salida
razonable, se aceptan varias — un eval que exige una respuesta que el propio diseño no determina
mide la suerte, no la calidad.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.config import settings

from ._graph import build_eval_graph
from .grounding import unsupported_claims


# Las 7 tools del GroceriesAgent. Hace falta nombrarlas para poder distinguir «no le toca y se
# abstuvo» de «no le toca y OTRO agente respondió» — que es el handoff de §5.4·D funcionando, no un
# fallo. La primera versión de este eval exigía «ninguna tool» y marcaba en rojo justo el caso en
# que el sistema hacía LO CORRECTO: mandar «¿cuánto gasté en el súper?» a Insights.
_GROCERIES_TOOLS = frozenset(
    {
        "search_groceries",
        "compare_prices",
        "explore_alternatives",
        "basket_for_budget",
        "cheapest_store_by_category",
        "monthly_cost",
        "worth_second_store",
    }
)


@dataclass
class Case:
    question: str
    # Tools aceptables. Vacío = no debe llamar ninguna tool DE GROCERIES; que responda otro agente
    # es el resultado correcto, no un fallo.
    expect: tuple[str, ...] = ()
    note: str = ""


CORE: list[Case] = [
    # ── un producto: compare_prices ──
    Case("¿dónde está más barato el arroz Rica?", ("compare_prices",)),
    Case("¿cuánto cuesta el café Santo Domingo?", ("compare_prices",)),
    Case("precio del aceite Mazola", ("compare_prices",)),
    Case("qué precio tiene la leche Rica", ("compare_prices",)),
    # ── la feature estrella: basket_for_budget ──
    Case("con RD$10,000 qué me alcanza para la compra del hogar", ("basket_for_budget",)),
    Case("armame una lista de compra con 5000 pesos", ("basket_for_budget",)),
    Case("con 3 mil pesos cuánto me rinde en el súper", ("basket_for_budget",)),
    # ── una sección entera: cheapest_store_by_category ──
    Case("¿qué supermercado es más barato para lácteos?", ("cheapest_store_by_category",)),
    Case("dónde compro más barato la limpieza", ("cheapest_store_by_category",)),
    # ── alternativas y tamaños ──
    Case("¿me conviene el arroz grande o el chico?", ("explore_alternatives", "compare_prices")),
    Case("qué otras opciones tengo de aceite", ("explore_alternatives", "compare_prices")),
    # ── costo de vida por rubro ──
    Case("¿cuánto me cuesta la limpieza al mes?", ("monthly_cost", "cheapest_store_by_category")),
    # ── el viaje a la segunda tienda ──
    Case("¿vale la pena ir a dos súpers con 8000 pesos?", ("worth_second_store",)),
    # ── búsqueda exploratoria ──
    Case("qué arroces tienen", ("search_groceries", "compare_prices")),
    # ── degradación honesta (§8.1): no existe, y no se inventa ──
    Case(
        "¿cuánto cuesta el flux capacitor de plutonio?",
        ("compare_prices", "search_groceries"),
        note="debe decir que no lo tiene",
    ),
    # ── §5.4·D — no le toca: es Insights, no Save ──
    Case("¿cuánto gasté en el súper este mes?", (), note="handoff: es Insights"),
    Case("hola, ¿cómo estás?", (), note="chit-chat"),
]


@dataclass
class Outcome:
    tools_called: list[str] = field(default_factory=list)
    tool_outputs: list[str] = field(default_factory=list)
    answer: str = ""


def _run(graph, question: str, i: int) -> Outcome:  # type: ignore[no-untyped-def]
    cfg = {"configurable": {"thread_id": f"groceries-eval-{i}-{uuid.uuid4()}"}}
    result = graph.invoke(
        {
            "messages": [HumanMessage(question)],
            "user_id": str(uuid.uuid4()),
            "capabilities": [],
            "language": "es",
            "ui_language": "es",
            "personality": "neutral",
            "ui_actions": [],
        },
        cfg,
    )
    out = Outcome()
    for m in result.get("messages", []):
        if isinstance(m, ToolMessage):
            out.tools_called.append(getattr(m, "name", "?"))
            out.tool_outputs.append(str(m.content))
        elif isinstance(m, AIMessage) and m.content:
            out.answer = str(m.content)
    return out


def main() -> None:
    if not (settings.openai_api_key or settings.anthropic_api_key):
        print("Sin key de LLM — eval omitido.")
        return

    graph = build_eval_graph()
    print("=" * 78)
    print("EVAL GroceriesAgent — trayectoria (§12.2) + fidelidad (§12.3), LLM real")
    print("=" * 78)

    tool_ok = 0
    faithful_ok = 0
    inventions: list[tuple[str, list[str]]] = []

    for i, case in enumerate(CORE):
        out = _run(graph, case.question, i)
        called = out.tools_called

        if case.expect:
            ok = any(t in case.expect for t in called)
        else:
            ok = not any(t in _GROCERIES_TOOLS for t in called)
        tool_ok += ok

        bad = unsupported_claims(out.answer, out.tool_outputs)
        faithful_ok += not bad
        if bad:
            inventions.append((case.question, bad))

        print(
            f"  [{'OK ' if ok else 'XX '}] esperaba={'|'.join(case.expect) or '(ninguna de groceries)':<38} "
            f"llamó={'|'.join(called) or '(ninguna)':<38}"
        )
        print(f"        {'✓' if not bad else '✗ INVENTÓ ' + ', '.join(bad)} · {case.question}")
        if not ok:
            # Sin la respuesta, un fallo de trayectoria no dice POR QUÉ falló — y esa es la única
            # pregunta que importa para arreglarlo.
            print(f"        ↳ respondió: {out.answer[:220].replace(chr(10), ' ')}")

    total = len(CORE)
    print("-" * 78)
    pct_tool = 100 * tool_ok // total
    print(f"  SELECCIÓN DE TOOL: {tool_ok}/{total} ({pct_tool}%)   objetivo ≥90%  "
          f"{'✅' if pct_tool >= 90 else '❌'}")
    print(f"  FIDELIDAD:         {faithful_ok}/{total} sin invenciones   objetivo 100%  "
          f"{'✅' if faithful_ok == total else '❌'}")
    if inventions:
        print("\n  ⚠️  CIFRAS QUE NINGUNA TOOL DEVOLVIÓ — o el modelo calculó, o una tool cambió")
        print("      de formato. Las dos cosas hay que saberlas:")
        for question, bad in inventions:
            print(f"        {', '.join(bad)}  ← {question}")
    print("=" * 78)


if __name__ == "__main__":
    main()

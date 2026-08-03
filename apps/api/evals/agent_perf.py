"""Mini-eval de RENDIMIENTO del chat: TTFT, latencia total y tokens — SIN depender de LangSmith.

§9.4 del plan del GroceriesAgent dice medir con LangSmith. **No se puede**: la cuenta está en 429
(«Monthly unique traces usage limit exceeded») y eso bloquearía la fase entera. Este harness mide
lo mismo desde el cliente, que además es donde el usuario SIENTE la latencia:

  - **TTFT** — tiempo hasta el PRIMER frame `token` del SSE. Es la métrica que importa: con
    streaming, una respuesta de varios segundos puede empezar a aparecer en medio segundo, y la
    percepción la fija el primer token, no el último.
  - **Latencia total** — hasta el frame `done`.
  - **Tokens** — contados sobre el texto emitido (aproximación local; el costo exacto por proveedor
    exige la factura, no una traza).

Corre el GRAFO REAL con el LLM REAL. No es gate (`make test`): cuesta dinero.

    cd apps/api && uv run python -m evals.agent_perf [--n 5] [--intent groceries]

⚠️ **Lo que este harness ya demostró (2026-08-02): un agente ReAct NO streamea token a token.**
`create_agent` corre un grafo ANIDADO cuyos tokens no afloran en el `stream_mode="messages"` del
grafo padre, y aunque aflorasen llevarían el nombre del nodo interno y la allowlist de `sse.py` los
descartaría. Consecuencia: **TTFT ≈ latencia total**. Este script lo mide en vez de suponerlo.
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
import uuid

from langchain_core.messages import HumanMessage

from src.api.composition_root import SessionLocal
from src.contexts.aispace.agents.groceries.tools.catalog import compare_by_canonical_id
from src.contexts.aispace.flows.expense.categories import suggest_expense_categories
from src.contexts.aispace.flows.expense.flow import build_expense_flow
from src.contexts.aispace.flows.groceries.flow import build_groceries_flow
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.registry import build_registry
from src.contexts.aispace.orchestration.router import llm_classifier
from src.contexts.aispace.orchestration.sse import stream_events

# Las 5 preguntas guía de §1.2 + una de gasto (control: el camino que YA existe).
PROMPTS: dict[str, list[str]] = {
    "groceries": [
        "¿dónde está más barato el arroz Rica?",
        "precio del aceite",
        "con RD$10,000 qué me alcanza para la compra del hogar",
        "armame una lista de compra",
        "¿qué súper me conviene para el café?",
    ],
    "finance": ["gasté 500 en gasolina"],
    "general": ["hola, ¿cómo estás?"],
}


def _build_graph():  # type: ignore[no-untyped-def]
    from langgraph.checkpoint.memory import MemorySaver

    registry = build_registry(SessionLocal)
    finance = registry["register_expense"]
    expense_flow = build_expense_flow(
        commit_action=lambda state, action: finance.commit({**state, "pending_action": action}),
        suggest_categories=suggest_expense_categories,
    )
    # El flujo de desambiguación (§5.4·A) tiene que estar acá o se mide otro camino: sin él,
    # «precio del aceite» stagea su `pending_action` y `hitl` cae al confirm+commit LEGACY —
    # un «¿confirmás?» que en producción NUNCA aparece. El harness espeja el composition root.
    groceries_flow = build_groceries_flow(
        compare_by_id=lambda canonical_id: compare_by_canonical_id(
            SessionLocal, "DO", canonical_id
        )
    )
    # MemorySaver y no Postgres: se mide el GRAFO, no la persistencia.
    return build_graph(
        MemorySaver(),
        classifier=llm_classifier,
        registry=registry,
        flow_registry={"register_expense": expense_flow, "groceries": groceries_flow},
    )


def _measure(graph, prompt: str) -> dict:  # type: ignore[no-untyped-def]
    """Una interacción end-to-end por el MISMO camino SSE que consume el chat."""
    thread_id = str(uuid.uuid4())
    cfg = {"configurable": {"thread_id": thread_id}}
    inputs = {
        "messages": [HumanMessage(prompt)],
        "user_id": str(uuid.uuid4()),
        "capabilities": [],
        "language": "es",
        "ui_language": "es",
        "personality": "neutral",
        "ui_actions": [],
    }

    started = time.perf_counter()
    ttft = None
    chars = 0
    frames = 0
    for raw in stream_events(graph, inputs, cfg, thread_id):
        frames += 1
        payload = json.loads(raw.removeprefix("data: ").strip())
        if payload.get("type") == "token":
            if ttft is None:
                ttft = time.perf_counter() - started
            chars += len(payload.get("content", ""))
    total = time.perf_counter() - started

    return {
        "prompt": prompt,
        "ttft_s": ttft if ttft is not None else total,
        "total_s": total,
        "streamed": ttft is not None and (total - ttft) > 0.15,  # ¿goteó, o llegó todo junto?
        "chars": chars,
        "frames": frames,
    }


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(int(round(pct / 100 * (len(ordered) - 1))), len(ordered) - 1)
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=3, help="repeticiones por prompt")
    parser.add_argument("--intent", default="finance", choices=sorted(PROMPTS))
    args = parser.parse_args()

    graph = _build_graph()
    runs: list[dict] = []
    for prompt in PROMPTS[args.intent]:
        for _ in range(args.n):
            runs.append(_measure(graph, prompt))
            print(
                f"  {runs[-1]['ttft_s']:5.2f}s ttft · {runs[-1]['total_s']:5.2f}s total · "
                f"{'GOTEA' if runs[-1]['streamed'] else 'TODO JUNTO'} · {prompt[:44]}"
            )

    ttfts = [r["ttft_s"] for r in runs]
    totals = [r["total_s"] for r in runs]
    streamed = sum(1 for r in runs if r["streamed"])

    print(f"\n=== {args.intent} · N={len(runs)} ===")
    print(f"  TTFT      p50={_percentile(ttfts, 50):.2f}s  p95={_percentile(ttfts, 95):.2f}s"
          f"   (objetivo <1s)")
    print(f"  TOTAL     p50={_percentile(totals, 50):.2f}s  p95={_percentile(totals, 95):.2f}s"
          f"   (objetivo p95 <4s)")
    print(f"  streaming REAL (goteo): {streamed}/{len(runs)} corridas")
    print(f"  media de caracteres emitidos: {statistics.mean(r['chars'] for r in runs):.0f}")
    if streamed == 0:
        print(
            "\n  ⚠️ NINGUNA corrida goteó: el texto llega ENTERO al final. Para un agente ReAct\n"
            "     esto es lo ESPERADO (grafo anidado + allowlist), y significa TTFT ≈ total.\n"
            "     El objetivo de TTFT <1s NO se cumple por streaming: exige otra palanca."
        )


if __name__ == "__main__":
    main()

"""Mini-eval del FinanceAgent — accuracy de SELECCIÓN DE TOOL (Cleo §3, offline).

Pasa un set ETIQUETADO de frases por el grafo completo (router → agente ReAct) y mide si el
sistema hace lo correcto: registrar (escritura, stagea), consultar (lectura, get_monthly_summary)
o nada (chit-chat → respond_other). Para los registros, mide también la extracción (monto/categoría).

NO es parte del gate (`make test`): pega al LLM real. Se corre a demanda:
    cd apps/api && uv run python -m evals.finance_eval

Es el embrión del "evaluation pipeline" del §7.1/§7.9 (hoy offline; faltan traffic mirroring,
prompt optimization y la capa online — ver Cleo §3). Sirve para no romper Finance al iterar prompts.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, ToolMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from src.config import settings
from src.contexts.aispace.agents.finance.tools.transactions import execute_register_transaction
from src.contexts.aispace.orchestration.graph import build_graph
from src.contexts.aispace.orchestration.registry import build_registry
from src.contexts.aispace.orchestration.router import llm_classifier
from src.contexts.insights.domain.ledger import Account, AccountType
from src.contexts.insights.infrastructure.repositories import SqlAccountRepository
from src.shared.money import Currency
from langgraph.checkpoint.memory import MemorySaver

DOP = Currency("DOP")


@dataclass
class Case:
    phrase: str
    expect: str                 # "register" | "query" | "other"
    amount: float | None = None  # esperado (solo register)
    category: str | None = None  # subcadena esperada (solo register)


# Set etiquetado: registros, consultas, chit-chat (lo medido) + edge cases (reportados aparte).
CORE: list[Case] = [
    # ── register (escritura) ──
    Case("gasté 500 en gasolina", "register", 500, "gasolin"),
    Case("pagué 1200 de luz", "register", 1200, "luz"),
    Case("compré café por 150 en Starbucks", "register", 150, None),  # categoría libre (Comida/Café son ok)
    Case("me gasté 80 en el colmado", "register", 80, None),
    Case("registra un gasto de 2000 en renta", "register", 2000, "renta"),
    Case("acabo de pagar 350 de Spotify", "register", 350, None),
    Case("gasté RD$45.50 en el parqueo", "register", 45.5, "parqueo"),
    # ── register income ──
    Case("me pagaron 20000 de salario", "register", 20000, None),
    Case("cobré 5000 de un freelance", "register", 5000, None),
    # ── query (lectura) ──
    Case("¿cuánto llevo gastado este mes?", "query"),
    Case("¿cuánto puedo gastar hoy?", "query"),
    Case("¿cómo voy con mis finanzas?", "query"),
    Case("¿cuál es mi balance?", "query"),
    Case("muéstrame mis gastos del mes", "query"),
    Case("¿cuánto he ahorrado?", "query"),
    # ── other (chit-chat) ──
    Case("hola, ¿cómo estás?", "other"),
    Case("cuéntame un chiste", "other"),
    Case("¿qué tiempo hace hoy?", "other"),
]

EDGE: list[Case] = [  # se reportan, NO cuentan en el %
    Case("gasté en el súper", "register"),          # sin monto → debería pedirlo
    Case("pagué 500 y 300 hoy", "register"),         # dos montos → ambiguo
    Case("¿cuánto gasté y registra 100 en taxi?", "register"),  # consulta + registro mezclados
]


def _factory(session: Session):  # type: ignore[no-untyped-def]
    @contextmanager
    def _f():
        yield session
    return _f


def _outcome(result: dict) -> str:
    """Clasifica qué hizo el sistema a partir del resultado del grafo."""
    if "__interrupt__" in result:
        return "register"  # escritura staged → pausó en el HITL
    for m in result.get("messages", []):
        if isinstance(m, ToolMessage) and getattr(m, "name", "") in ("get_monthly_summary", "get_safe_to_spend"):
            return "query"
    return "other"  # no llamó tool financiera → ruteó a respond_other (o chit-chat)


def _run(graph, user_id: str, phrase: str, i: int) -> tuple[str, dict | None]:  # type: ignore[no-untyped-def]
    cfg = {"configurable": {"thread_id": f"eval-{i}"}}
    result = graph.invoke(
        {"messages": [HumanMessage(phrase)], "user_id": user_id, "capabilities": []}, cfg
    )
    pending = graph.get_state(cfg).values.get("pending_action")
    return _outcome(result), pending


def main() -> None:
    if not (settings.openai_api_key or settings.anthropic_api_key):
        print("Sin key de LLM — eval omitido.")
        return

    engine = create_engine(settings.database_url)
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        user_id = str(uuid.uuid4())
        SqlAccountRepository(session).add(
            Account(str(uuid.uuid4()), user_id, AccountType.ASSET, DOP, "Banco")
        )
        execute_register_transaction(user_id, _factory(session), amount=300, category="Comida")
        graph = build_graph(MemorySaver(), classifier=llm_classifier, registry=build_registry(_factory(session)))

        print("=" * 70)
        print("MINI-EVAL FinanceAgent — selección de tool (LLM real)")
        print("=" * 70)
        routing_ok = 0
        extraction_ok = 0
        extraction_total = 0
        by_label: dict[str, list[int]] = {"register": [0, 0], "query": [0, 0], "other": [0, 0]}
        for i, c in enumerate(CORE):
            got, pending = _run(graph, user_id, c.phrase, i)
            ok = got == c.expect
            routing_ok += ok
            by_label[c.expect][1] += 1
            by_label[c.expect][0] += ok
            extra = ""
            if c.expect == "register" and c.amount is not None:
                extraction_total += 1
                amt = pending.get("amount") if pending else None
                amt_ok = amt is not None and abs(amt - c.amount) < 0.001
                extraction_ok += amt_ok
                cat = pending.get("category") if pending else None
                extra = f"  [monto {amt} {'✓' if amt_ok else '✗ esperaba ' + str(c.amount)} · cat {cat}]"
            print(f"  [{'OK ' if ok else 'XX '}] {c.expect:8} ← {got:8} | {c.phrase}{extra}")

        print("-" * 70)
        for label, (ok, tot) in by_label.items():
            if tot:
                print(f"  {label:8}: {ok}/{tot} ({100 * ok // tot}%)")
        print(f"  ROUTING total:    {routing_ok}/{len(CORE)} ({100 * routing_ok // len(CORE)}%)")
        print(f"  MONTO (exacto):   {extraction_ok}/{extraction_total} ({100 * extraction_ok // extraction_total if extraction_total else 0}%)  · categoría = libre (info)")
        print("=" * 70)
        print("EDGE CASES (reportados, no cuentan):")
        for j, c in enumerate(EDGE, start=len(CORE)):
            got, pending = _run(graph, user_id, c.phrase, j)
            print(f"  → {got:8} | {c.phrase}" + (f"  [staged: {pending.get('amount')}/{pending.get('category')}]" if pending else ""))
        print("=" * 70)
    finally:
        session.close()
        trans.rollback()
        conn.close()
        engine.dispose()


if __name__ == "__main__":
    main()

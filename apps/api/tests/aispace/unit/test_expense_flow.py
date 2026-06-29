"""Unit — el flow declarativo multi-step de gastos (slices 2 & 3.5).

Recorre confirm → ¿categoría? → sugerencias (chips icon-only) → commit + deep link, 1 interrupt
por step, con fakes (sin LLM/DB). La mecánica multi-interrupt re-ejecuta el nodo `hitl` desde arriba
en cada resume → las sugerencias se computan UNA vez en el hook `prepare` (nodo aparte) y se memoizan
en `pending_action`; `suggest_categories` (el LLM) NO se re-llama en los resumes.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from src.contexts.aispace.flows.expense.flow import build_expense_flow
from src.contexts.aispace.orchestration.graph import build_graph


class FakeWriteAgent:
    intents = ("register_expense",)

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Wow!!! 🫣 casi al límite de tu presupuesto.")],
            "pending_action": {
                "amount": 500, "currency": "USD", "category": "Suscripciones música",
                "merchant": "Spotify", "summary": "US$500 en Spotify", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        raise AssertionError("el flow commitea vía commit_action, no el agente")


class _SuggestSpy:
    """Cuenta cuántas veces se llama (debe ser 1 → memoización), devuelve dicts serializables."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, state) -> list[dict]:  # type: ignore[no-untyped-def]
        self.calls += 1
        return [{"value": "music", "icon": "🎵"}, {"value": "fuel", "icon": "⛽"}]


def _build(committed: dict, suggest):  # type: ignore[no-untyped-def]
    def commit_action(state, action) -> str:  # type: ignore[no-untyped-def]
        committed.update(action)
        return "Listo, tu gasto ha sido registrado ✅"

    flow = build_expense_flow(commit_action=commit_action, suggest_categories=suggest)
    return build_graph(
        MemorySaver(),
        classifier=lambda t, c: "register_expense",
        registry={"register_expense": FakeWriteAgent()},
        flow_registry={"register_expense": flow},
    )


def _msg(text: str) -> dict:
    return {"messages": [HumanMessage(text)], "user_id": "u1", "capabilities": []}


def _interaction(out: dict) -> dict:
    return out["__interrupt__"][0].value


def test_step1_confirm_interaction() -> None:
    graph = _build({}, _SuggestSpy())
    cfg = {"configurable": {"thread_id": "f1"}}
    out = graph.invoke(_msg("gasté 500 en spotify"), cfg)
    inter = _interaction(out)
    assert "500" in inter["prompt"]
    assert [o["value"] for o in inter["options"]] == ["cancel", "confirm"]


def test_full_happy_path_with_category_and_deeplink() -> None:
    committed: dict = {}
    suggest = _SuggestSpy()
    graph = _build(committed, suggest)
    cfg = {"configurable": {"thread_id": "f2"}}
    graph.invoke(_msg("gasté 500 en spotify"), cfg)

    out = graph.invoke(Command(resume="confirm"), cfg)
    assert [o["value"] for o in _interaction(out)["options"]] == ["none", "yes"]

    out = graph.invoke(Command(resume="yes"), cfg)
    opts = _interaction(out)["options"]
    assert opts[0]["value"] == "none" and opts[0]["kind"] == "pill"
    chips = [o for o in opts if o["kind"] == "chip"]
    assert [c["value"] for c in chips] == ["music", "fuel"]
    assert chips[0]["icon"] == "🎵"

    out = graph.invoke(Command(resume="music"), cfg)
    assert "__interrupt__" not in out
    assert committed["category"] == "music" and committed["amount"] == 500
    assert "registrado" in " ".join(m.content for m in out["messages"])
    actions = graph.get_state(cfg).values["ui_actions"]
    assert any(a["type"] == "link" and a["href"] == "insights" for a in actions)

    # Memoización: el LLM de sugerencias corrió UNA sola vez pese a los 3 resumes.
    assert suggest.calls == 1


def test_skip_category_commits_without_category() -> None:
    committed: dict = {}
    graph = _build(committed, _SuggestSpy())
    cfg = {"configurable": {"thread_id": "f3"}}
    graph.invoke(_msg("gasté 500 en spotify"), cfg)
    graph.invoke(Command(resume="confirm"), cfg)
    out = graph.invoke(Command(resume="none"), cfg)  # No, sin categoría → salta sugerencias
    assert "__interrupt__" not in out
    assert committed["category"] is None and committed["amount"] == 500


def test_cancel_at_confirm_does_not_commit() -> None:
    committed: dict = {}
    graph = _build(committed, _SuggestSpy())
    cfg = {"configurable": {"thread_id": "f4"}}
    graph.invoke(_msg("gasté 500 en spotify"), cfg)
    out = graph.invoke(Command(resume="cancel"), cfg)
    assert "__interrupt__" not in out
    assert committed == {}
    assert graph.get_state(cfg).values["pending_action"] is None

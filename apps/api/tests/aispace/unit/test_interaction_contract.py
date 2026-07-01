"""Unit — el contrato HITL genérico `Interaction {prompt, options[]}` (slice 1).

El `interrupt()` del grafo deja de emitir `{confirm: summary}` (single-step, sólo sí/no) y pasa
a emitir una `Interaction` genérica con opciones tipadas. Es la costura que habilita los flows
multi-step (gasto: confirmar → ¿categoría? → sugerencias) y futuros flujos, sin recablear el
grafo: el mismo payload lo renderiza el dock en mobile para CUALQUIER paso.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver

from src.contexts.aispace.orchestration.graph import build_graph


class FakeWriteAgent:
    intents = ("register_expense",)

    def __init__(self) -> None:
        self.committed = False

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Preparé el registro, confírmalo.")],
            "pending_action": {
                "amount": 500, "currency": "USD", "category": None,
                "summary": "registrar US$500 en Spotify", "requires_confirmation": True,
            },
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        self.committed = True
        return "Registré US$500."


def _graph(agent):  # type: ignore[no-untyped-def]
    return build_graph(
        MemorySaver(),
        classifier=lambda t, c: "register_expense",
        registry={"register_expense": agent},
    )


def _msg(text: str) -> dict:
    return {"messages": [HumanMessage(text)], "user_id": "u1", "capabilities": []}


def test_confirm_step_emits_generic_interaction() -> None:
    """El primer paso HITL pausa con una Interaction {prompt, options:[cancel, confirm]} —
    NO con el viejo {confirm: summary}."""
    graph = _graph(FakeWriteAgent())
    cfg = {"configurable": {"thread_id": "i1"}}
    out = graph.invoke(_msg("gasté 500 en spotify"), cfg)

    assert "__interrupt__" in out
    payload = out["__interrupt__"][0].value
    assert isinstance(payload, dict)
    # Contrato genérico (escalable a N pasos/flujos):
    assert payload.get("prompt"), "la interacción debe traer un prompt humano"
    options = payload.get("options")
    assert isinstance(options, list) and [o["value"] for o in options] == ["cancel", "confirm"]
    # variantes tipadas para el dock (pill primario/secundario)
    variants = {o["value"]: o["variant"] for o in options}
    assert variants == {"cancel": "secondary", "confirm": "primary"}
    # cada opción es un pill de texto (no chip) en este paso
    assert all(o["kind"] == "pill" for o in options)

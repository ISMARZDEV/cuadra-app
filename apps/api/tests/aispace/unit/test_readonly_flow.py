"""Unit — ¿el motor de `flows/` soporta un flujo SIN escritura? (§5.4·A, bloqueante de la Fase 6)

El motor se construyó para el registro de gastos: multi-step con una escritura al final. El flujo
de desambiguación del `GroceriesAgent` («tengo 14 arroces, ¿cuál?») usa el mismo canal —el dock—
pero **no escribe nada**: usa la interacción para ELEGIR, no para CONFIRMAR una escritura.

Esta es la verificación que el plan exige ANTES de construir el flujo. Prueba, no razonamiento.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from src.contexts.aispace.flows.base import FlowSpec, Interaction, Option, Step
from src.contexts.aispace.orchestration.graph import build_graph


class _DisambiguatingAgent:
    """Agente de SOLO LECTURA que pide desambiguar. `commit()` es no-op: no tiene con qué escribir."""

    intents = ("groceries",)

    def __init__(self) -> None:
        self.commit_calls = 0

    def run(self, state) -> dict:  # type: ignore[no-untyped-def]
        return {
            "messages": [AIMessage("Tengo varios arroces.")],
            # `requires_confirmation` es la ÚNICA llave que enciende el nodo hitl. Para un flujo de
            # lectura el nombre miente, pero el mecanismo es el correcto: «hay que hablar con el
            # humano antes de responder».
            "pending_action": {"requires_confirmation": True, "summary": "elegir arroz"},
        }

    def commit(self, state) -> str:  # type: ignore[no-untyped-def]
        self.commit_calls += 1
        return ""


def _pick_step() -> Step:
    def build(state: dict, answers: dict) -> Interaction | None:
        return Interaction(
            prompt="¿Cuál?",
            options=[
                Option("campos", "Arroz Campos 20Lb"),
                Option("bisono", "Arroz Bisonó 50Lb"),
            ],
        )

    return Step(id="pick", build=build)


def _readonly_flow(spy: dict) -> FlowSpec:
    """Un FlowSpec cuyo `commit` NO escribe: solo redacta la respuesta con lo elegido."""

    def terminal(state: dict, answers: dict) -> dict:
        spy["answers"] = answers
        return {
            "messages": [AIMessage(f"El más barato de {answers['pick']} está en Bravo.")],
            "pending_action": None,
            "ui_actions": [{"type": "link", "text": "Ver en Bravo", "href": "https://bravo.do/p"}],
        }

    return FlowSpec(steps=(_pick_step(),), commit=terminal)


def _graph(agent, flow):  # type: ignore[no-untyped-def]
    return build_graph(
        MemorySaver(),
        classifier=lambda text, caps: "groceries",
        registry={"groceries": agent},
        flow_registry={"groceries": flow},
    )


def test_the_engine_DOES_support_a_flow_without_a_write() -> None:
    """VEREDICTO: sí encaja. `commit` es el paso TERMINAL del flujo, no necesariamente una
    escritura — nada en `drive_flow` obliga a que persista algo."""
    spy: dict = {}
    agent = _DisambiguatingAgent()
    graph = _graph(agent, _readonly_flow(spy))
    cfg = {"configurable": {"thread_id": "t-readonly"}}

    graph.invoke({"messages": [HumanMessage("¿dónde está más barato el arroz?")]}, cfg)
    snapshot = graph.get_state(cfg)
    interaction = next(
        (dict(i.value) for task in snapshot.tasks for i in getattr(task, "interrupts", ())),
        None,
    )

    assert interaction is not None, "el grafo debía pausar para preguntar"
    assert interaction["prompt"] == "¿Cuál?"
    assert [o["value"] for o in interaction["options"]] == ["campos", "bisono"]

    graph.invoke(Command(resume="campos"), cfg)
    final = graph.get_state(cfg).values

    assert "campos" in final["messages"][-1].content
    assert spy["answers"] == {"pick": "campos"}
    assert agent.commit_calls == 0, "el flujo NO debe pasar por AgentSpec.commit"


def test_the_readonly_flow_emits_links_like_any_other() -> None:
    """El canal de enlaces es el mismo: `ui_actions` que el commit del flujo devuelve."""
    spy: dict = {}
    graph = _graph(_DisambiguatingAgent(), _readonly_flow(spy))
    cfg = {"configurable": {"thread_id": "t-links"}}

    graph.invoke({"messages": [HumanMessage("arroz")]}, cfg)
    graph.invoke(Command(resume="bisono"), cfg)

    links = [a for a in graph.get_state(cfg).values["ui_actions"] if a["type"] == "link"]
    assert links == [{"type": "link", "text": "Ver en Bravo", "href": "https://bravo.do/p"}]


def test_cancelling_a_readonly_flow_writes_nothing_and_says_so() -> None:
    spy: dict = {}
    graph = _graph(_DisambiguatingAgent(), _readonly_flow(spy))
    cfg = {"configurable": {"thread_id": "t-cancel"}}

    graph.invoke({"messages": [HumanMessage("arroz")]}, cfg)
    graph.invoke(Command(resume="cancel"), cfg)
    final = graph.get_state(cfg).values

    assert final["pending_action"] is None
    assert "answers" not in spy, "cancelar no debe llegar al paso terminal"


def test_a_readonly_agent_WITHOUT_pending_action_never_reaches_the_flow() -> None:
    """La respuesta directa (sin ambigüedad) sigue el camino de lectura: cero interrupts."""

    class _DirectAgent:
        intents = ("groceries",)

        def run(self, state) -> dict:  # type: ignore[no-untyped-def]
            return {"messages": [AIMessage("El arroz Campos está en Bravo.")], "pending_action": None}

        def commit(self, state) -> str:  # type: ignore[no-untyped-def]
            raise AssertionError("una lectura directa no debe commitear")

    spy: dict = {}
    graph = _graph(_DirectAgent(), _readonly_flow(spy))
    cfg = {"configurable": {"thread_id": "t-direct"}}

    graph.invoke({"messages": [HumanMessage("precio del arroz campos")]}, cfg)
    snapshot = graph.get_state(cfg)

    assert not any(getattr(task, "interrupts", ()) for task in snapshot.tasks)
    assert "Campos" in snapshot.values["messages"][-1].content

"""Registry de agentes (intent → AgentSpec). Añadir un agente = una entrada aquí; el grafo
NO se toca (patrón del reuso: "añadir sub-agentes sin tocar el orchestrator").

Es una FUNCIÓN (no un dict estático) porque los agentes necesitan deps (session_factory);
se arma en el composition_root. Cada agente declara los `intents` que maneja.
"""
from __future__ import annotations

from src.contexts.aispace.agents.base import AgentSpec
from src.contexts.aispace.agents.finance.agent import FinanceAgent
from src.contexts.aispace.agents.finance.tools.transactions import SessionFactory


def build_registry(session_factory: SessionFactory) -> dict[str, AgentSpec]:
    finance = FinanceAgent(session_factory)
    agents: list[AgentSpec] = [finance]
    registry: dict[str, AgentSpec] = {}
    for agent in agents:
        for intent in agent.intents:
            registry[intent] = agent
    return registry

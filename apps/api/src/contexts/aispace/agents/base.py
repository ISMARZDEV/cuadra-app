"""Contrato común de los agentes (Protocol). Todo agente que entre al registry lo cumple.

`plan(state) -> pending_action` (qué haría, sin escribir aún) y `execute(state) -> reply`
(ejecuta la acción ya confirmada y redacta). `intents` = las intenciones que maneja.
Separa el "qué" (plan, confirmable por HITL) del "hacer" (execute) — clave para §7.4.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class AgentSpec(Protocol):
    intents: tuple[str, ...]

    def plan(self, state: dict) -> dict: ...      # → pending_action
    def execute(self, state: dict) -> str: ...    # → texto de respuesta

"""Contrato común de los agentes (Protocol). Todo agente que entre al registry lo cumple.

`run(state)` corre el agente (ReAct) y devuelve `{messages, pending_action}` — las tools de
lectura ya respondieron; las de escritura dejan un `pending_action` STAGED (para el HITL).
`commit(state) -> reply` ejecuta ese pending_action ya confirmado. `intents` = lo que maneja.
Separar run (qué haría / lecturas) de commit (la escritura confirmada) es la clave de §7.4.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class AgentSpec(Protocol):
    intents: tuple[str, ...]

    def run(self, state: dict) -> dict: ...       # → {messages, pending_action}
    def commit(self, state: dict) -> str: ...     # ejecuta el pending_action confirmado → reply

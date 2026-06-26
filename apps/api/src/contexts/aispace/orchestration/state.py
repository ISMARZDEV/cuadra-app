"""Estado del grafo del orquestador AISpace (§7.2). Extiende `MessagesState`.

Reducers explícitos (best practice LangGraph): `messages` acumula vía `add_messages`;
`ui_actions` vía `add` (si no, se pierde entre nodos — bug #1 del padre). El resto son
campos de un solo valor que cada nodo sobrescribe.
"""
from __future__ import annotations

from langgraph.graph import MessagesState


class IAMState(MessagesState):
    user_id: str
    capabilities: list[str]              # gobierna qué tools puede usar (RBAC §12.1)
    intent: str
    pending_action: dict | None          # acción a confirmar (HITL §7.4)
    # ui_actions (botones/tarjetas, reducer `add`) se añade en el slice de streaming (§7.6).

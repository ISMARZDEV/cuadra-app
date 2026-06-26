"""Protocolo de handoff (§7.1, lección de Cleo): TODO clasificador se equivoca.

Cuando un agente recibe un mensaje que NO le toca, debe poder **reenrutar** al especialista
correcto sin que el usuario reempiece. Se diseña desde el día 1 (aunque hoy haya UN agente)
para no rediseñar al escalar — pero NO se cablea al grafo todavía: con un solo agente no hay
a quién hacer handoff. Cuando entre el 2º agente:

  1. cada agente expone una tool `select_new_agent(target_intent)` (contrato de abajo),
  2. `plan()` puede devolver `{"handoff": <intent>}` en vez de un `pending_action`,
  3. el grafo enruta a `agent_plan` del `target` (un edge condicional extra), sin tocar agentes.

Patrón estilo Swarm montado ENCIMA del router (el router resuelve el caso común; el handoff
corrige la mala clasificación). Ver `startup/arquitectura-mvp.md` §7.1.
"""
from __future__ import annotations

HANDOFF_KEY = "handoff"  # clave en el dict de plan() que dispara el reenrutado


def request_handoff(target_intent: str) -> dict:
    """Contrato: un agente devuelve esto desde plan() para ceder el turno a otro especialista."""
    return {HANDOFF_KEY: target_intent}

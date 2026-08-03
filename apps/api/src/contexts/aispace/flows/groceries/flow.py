"""Flujo de DESAMBIGUACIÓN del GroceriesAgent (§5.4·A) — el de mayor retorno de los cuatro.

    Usuario:  «¿dónde está más barato el arroz?»
              ↓ la consulta matchea 10 arroces PERFECTO y por igual
    Agente:   «Tengo varios. ¿Cuál?»
              [ Arroz Campos 20Lb ] [ Arroz Bisonó 50Lb ] …     ← pills del dock
              ↓ el usuario toca una
    Agente:   la comparación del producto EXACTO, con enlaces

Por qué es el de mayor retorno:

- **Reusa UI ya construida.** El dock de mobile ya renderiza `prompt` + `options`. Cero UI nueva.
- **Ataca el fallo más caro.** Comparar el producto equivocado es lo que el usuario detecta al
  instante y castiga. Preguntar cuesta un turno; equivocarse cuesta la credibilidad.
- **Sube la precisión sin subir el modelo.** Es la alternativa barata al rerank: cuando el
  retrieval no discrimina, decide el humano — 100% de acierto y cero tokens de razonamiento.

⚠️ **Es de SOLO LECTURA.** Usa el canal de interacción para *elegir*, no para *confirmar una
escritura*. `FlowSpec.commit` es el paso TERMINAL del flujo, no necesariamente una escritura —
verificado con `tests/aispace/unit/test_readonly_flow.py`.
"""
from __future__ import annotations

from collections.abc import Callable

from langchain_core.messages import AIMessage

from src.shared.i18n import t

from ..base import FlowSpec, Interaction, Option, Step

# El texto de la pregunta es CHROME determinista → catálogo i18n (es/en/pt), nunca hardcodeado.
_PROMPT_KEY = "groceries.which_one"


def _pick_step() -> Step:
    def build(state: dict, answers: dict) -> Interaction | None:
        action = state.get("pending_action") or {}
        options = action.get("options") or []
        if not options:
            return None  # sin opciones no hay nada que preguntar → el flujo se salta
        lang = state.get("ui_language") or state.get("language", "es")
        return Interaction(
            prompt=t(_PROMPT_KEY, lang),
            options=[Option(value=o["value"], label=o["label"]) for o in options],
        )

    return Step(id="pick", build=build)


def build_groceries_flow(
    compare_by_id: Callable[[str], tuple[str, list[dict]]],
) -> FlowSpec:
    """`compare_by_id(canonical_product_id) -> (texto de la respuesta, ui_actions)`.

    La comparación se inyecta para que el flujo no conozca ni la DB ni las tools: solo orquesta la
    pregunta y delega el «ahora sí, comparalo».
    """

    def terminal(state: dict, answers: dict) -> dict:
        chosen = answers.get("pick")
        if not chosen:
            return {"pending_action": None}
        reply, ui_actions = compare_by_id(chosen)
        return {
            "messages": [AIMessage(reply)],
            "pending_action": None,
            "ui_actions": ui_actions,
        }

    return FlowSpec(steps=(_pick_step(),), commit=terminal)

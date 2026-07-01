"""Generic driver: runs a `FlowSpec`'s steps as a multi-step HITL sequence (1 interrupt/step).

Lives inside ONE graph node. LangGraph re-executes the node from the top on every resume, so each
`interrupt()` for an already-answered step returns its resume value (no re-pause) until the first
unanswered step pauses. Side-effects happen ONLY in `flow.commit` (reached after every step is
answered), so re-runs are safe. A `cancel`-valued answer (only the confirm step offers it) aborts.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage
from langgraph.types import interrupt

from src.shared.i18n import t

from .base import FlowSpec

# Values that abort the whole flow. Only the confirm step exposes "cancel"; legacy yes/no words kept
# so a plain Command(resume="no") still cancels.
CANCEL_VALUES = frozenset({"cancel", "no", "n", "cancelar", "não", "nao"})


def drive_flow(flow: FlowSpec, state: dict) -> dict:
    answers: dict[str, str] = {}
    for step in flow.steps:
        interaction = step.build(state, answers)
        if interaction is None:
            continue  # skipped (e.g. user declined a category → no suggestions step)
        answer = str(interrupt(interaction.to_dict())).strip()
        if answer.lower() in CANCEL_VALUES:
            lang = state.get("ui_language") or state.get("language", "es")
            return {"pending_action": None, "messages": [AIMessage(t("cancelled", lang))]}
        answers[step.id] = answer
    return flow.commit(state, answers)

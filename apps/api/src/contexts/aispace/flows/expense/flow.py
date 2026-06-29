"""The register-expense `FlowSpec` (Img 8-11), built from injected callables so it stays testable
and agent-agnostic:

  - `commit_action(state, action)` — registers the (now category-enriched) transaction, returns the
    confirmation text. Wired to the FinanceAgent in the graph; a fake in unit tests.
  - `suggest_categories(state)` — returns icon-only chip `Option`s for the suggestions step (Img 10).

Steps: confirm (Img 8) → ¿category? yes/no (Img 9) → suggestions, skipped if "no" (Img 10) → commit
+ "Ver en Insight" deep link via `ui_actions` (Img 11). Adding/removing a step = editing this tuple.
"""
from __future__ import annotations

from collections.abc import Callable

from langchain_core.messages import AIMessage

from src.shared.i18n import t

from ..base import FlowSpec, Interaction, Option, Step

CommitAction = Callable[[dict, dict], str]
# Returns serializable dicts (memoized into pending_action — must survive the checkpoint), each
# {"value": category-name, "icon": emoji}. The LLM call lives here; called ONCE in `prepare`.
SuggestCategories = Callable[[dict], list[dict]]


def _amount(pa: dict) -> str:
    currency = pa.get("currency")
    return f"${pa['amount']} {currency}".strip() if currency else f"${pa['amount']}"


def build_expense_flow(
    *, commit_action: CommitAction, suggest_categories: SuggestCategories
) -> FlowSpec:
    def confirm_step(state: dict, answers: dict) -> Interaction:
        lang = state.get("language", "es")
        return Interaction(
            prompt=t("expense.confirm", lang, amount=_amount(state["pending_action"])),
            options=[
                Option("cancel", t("confirm.cancel", lang), "secondary"),
                Option("confirm", t("confirm.approve", lang), "primary"),
            ],
        )

    def category_yesno_step(state: dict, answers: dict) -> Interaction:
        lang = state.get("language", "es")
        return Interaction(
            prompt=t("expense.category_q", lang),
            options=[
                Option("none", t("expense.no_category", lang), "secondary"),
                Option("yes", t("expense.yes_please", lang), "primary"),
            ],
        )

    def category_pick_step(state: dict, answers: dict) -> Interaction | None:
        if answers.get("category_yesno") != "yes":
            return None  # user declined → skip suggestions
        lang = state.get("language", "es")
        # Read the suggestions memoized by `prepare` (pure, no LLM here — this re-runs every resume).
        suggestions = state["pending_action"].get("suggested_categories", [])
        chips = [Option(s["value"], None, "primary", "chip", s.get("icon")) for s in suggestions]
        return Interaction(
            prompt=t("expense.suggestions", lang),
            options=[Option("none", t("expense.forget_category", lang), "secondary", "pill"), *chips],
        )

    def prepare(state: dict) -> dict:
        # Runs ONCE (own node) → compute the LLM category suggestions and memoize them so the step
        # loop can re-run freely without re-calling the LLM.
        pa = state["pending_action"]
        return {"pending_action": {**pa, "suggested_categories": suggest_categories(state)}}

    def commit(state: dict, answers: dict) -> dict:
        lang = state.get("language", "es")
        pick = answers.get("category_pick")
        category = pick if pick and pick != "none" else None
        reply = commit_action(state, {**state["pending_action"], "category": category})
        return {
            "pending_action": None,
            "messages": [AIMessage(reply)],
            "ui_actions": [{"type": "link", "text": t("see_in_insight", lang), "href": "insights"}],
        }

    return FlowSpec(
        steps=(
            Step("confirm", confirm_step),
            Step("category_yesno", category_yesno_step),
            Step("category_pick", category_pick_step),
        ),
        commit=commit,
        prepare=prepare,
    )

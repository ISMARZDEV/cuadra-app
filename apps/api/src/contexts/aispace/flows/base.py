"""Wire contract for HITL interactions — emitted by the graph's `interrupt()`, rendered by the
mobile dock UNCHANGED for any step of any flow.

`Interaction` = one human prompt + a list of typed `Option`s. An option is either a text `pill`
(confirm / category yes-no) or an icon-only `chip` (category suggestions, Img 10). The selected
option's `value` is what the client sends back via `Command(resume=value)`.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

OptionVariant = Literal["primary", "secondary"]
OptionKind = Literal["pill", "chip"]


@dataclass(frozen=True)
class Option:
    value: str                         # what the client resumes with
    label: str | None = None           # pill text (None for icon-only chips)
    variant: OptionVariant = "primary"  # primary = lime fill; secondary = translucent green
    kind: OptionKind = "pill"          # pill = text button; chip = round icon-only
    icon: str | None = None            # emoji / icon name for chips
    color: str | None = None           # chip ring color (hex) — per-category accent (Img 10)

    def to_dict(self) -> dict:
        return {
            "value": self.value,
            "label": self.label,
            "variant": self.variant,
            "kind": self.kind,
            "icon": self.icon,
            "color": self.color,
        }


@dataclass(frozen=True)
class Interaction:
    prompt: str
    options: list[Option] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"prompt": self.prompt, "options": [o.to_dict() for o in self.options]}


# A flow is an ordered list of Steps + a terminal commit. `build(state, answers)` returns the
# step's Interaction, or None to SKIP it (e.g. skip "pick a category" when the user said no). The
# driver re-runs the whole list on every resume (LangGraph multi-interrupt), so `build` MUST be
# pure — accumulate nothing outside `answers`, do all side-effects in `commit`.
@dataclass(frozen=True)
class Step:
    id: str
    build: Callable[[dict, dict], "Interaction | None"]


@dataclass(frozen=True)
class FlowSpec:
    steps: tuple[Step, ...]
    # (state, answers) -> state update (messages / ui_actions / pending_action=None). Does the write.
    commit: Callable[[dict, dict], dict]
    # Optional one-shot hook run in its OWN node BEFORE the step loop (so it executes EXACTLY once,
    # never re-run by the multi-interrupt loop). Use it to memoize anything expensive a step needs —
    # e.g. an LLM category suggestion — into the state. (state) -> state update.
    prepare: Callable[[dict], dict] | None = None

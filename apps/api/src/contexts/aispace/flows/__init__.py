"""HITL flow framework for AISpace — declarative multi-step interactions.

A *flow* is a sequence of steps that, after an agent stages a write, collect what's missing from
the user (confirm, category, …) via `interrupt()` and then commit. The graph stays agnostic: it
drives whatever `FlowSpec` the intent maps to (mirroring the agent registry), so adding a new flow
is a new `FlowSpec` + a registry entry — no graph rewiring. `base.py` holds the wire contract
(`Interaction`/`Option`) shared verbatim with the mobile dock.
"""

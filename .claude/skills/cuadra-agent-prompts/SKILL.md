---
name: cuadra-agent-prompts
description: >
  Design pattern + prompt-engineering rules for writing/editing any AI agent prompt, tool
  docstring or classifier prompt in Cuadra (contexts/aispace). Core rule: instructions in
  ENGLISH, reply in the user's language.
  Trigger: Writing or editing a system prompt, tool docstring (@tool), router/classifier
  prompt, or any text the LLM reads, anywhere under contexts/aispace.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- Writing or editing a **system prompt** for an agent (`agents/*/agent.py`).
- Writing a **tool docstring** (`@tool`) — the LLM reads it to pick/use the tool.
- Writing a **router/classifier** prompt (`orchestration/router.py`).
- Adding a **new agent** to the orchestrator.

## Critical Patterns

**1. Instructions in ENGLISH, reply in the user's language.** (Prompt language ≠ output language.)

| Text the LLM reads (instructions) | Text the USER sees (output) |
|---|---|
| system prompts, tool docstrings, classifier prompts → **English** | agent replies → **user's language** (injected) |
| Why: better instruction adherence, **stable in multi-turn**, ~24% more token-efficient *per content* (reinvest in better instructions, not a lower total) | i18n catalog strings (confirm/cancel/errors) → **localized (es/en/pt)** |

- This is consistent with **ADR 32** (code in English): prompts are functional config the model reads, closer to code than to user-facing prose.
- Inject the output language as a **concrete value**, not a vague rule:
  `"Reply EXCLUSIVELY in {language}."` ✅  —  `"reply in the user's language"` ❌ (a small model ignores it).
- **Never** put user-facing deterministic strings in a prompt — they go in `shared/i18n` (`t(key, lang)`).

**2. Prompt-engineering rules (apply when writing the English prompt):**

- **Structure in sections** with headers: `LANGUAGE` → `ROLE` → `TOOLS` → per-tool rules → `EXAMPLES`. Constraints/context first, examples last.
- **Tool selection guide**: a short decision list ("X → tool_a; Y → tool_b"). One tool = one job.
- **Tool docstrings = docs for a teammate**: purpose (when to use), each param, an example, constraints (what it does NOT do).
- **Positive phrasing**; reserve **CAPS** for critical safety rules only (`MUST`, `NEVER`, one write tool per turn).
- **Anti-hallucination**: enumerate the tools explicitly; never claim an action was done unless the tool was actually called; one write tool per turn.
- **Few-shot**: 2–3 concrete `user msg → tool_call(args)` examples (keep them short).
- **Token-efficient**: concise — *more words ≠ better prompt*. Rely on prompt caching for the system block.

**3. ALWAYS verify — do not assume.** Prompt-language effects are model-dependent. After ANY prompt change, re-run the eval and confirm no regression (ROUTING/MONTO stay at their bar). The eval is the safety net.

## Code Examples

Before (Spanish, 416 tokens) → After (English, 314 tokens, same behavior, −24%):

```python
# ❌ Before — instructions in Spanish
FINANCE_PROMPT = """# IDIOMA
Responde en {language}.
# REGISTRAR UN GASTO ...
"""

# ✅ After — instructions in English, reply still in {language}
FINANCE_PROMPT = """# LANGUAGE — TOP PRIORITY
Reply EXCLUSIVELY in {language}. These instructions are in English; every reply MUST be in {language}.

# ROLE
You are Cuadra's finance assistant. Be warm, concise, clear.

# TOOLS — pick exactly one
- register_transaction — the user spent or earned money (WRITE; system asks to confirm).
- get_monthly_summary  — "how am I doing / balance / how much have I spent" (READ).
- get_safe_to_spend    — "how much can I spend today / on budget?" (READ).

# LOGGING (register_transaction)
- kind="expense" (spent/paid/bought) or kind="income" (got paid/earned: salary...).
- Pass currency ONLY if named, as ISO 4217 (dollars→USD); else null.
- Calling it PREPARES the action; the SYSTEM asks Yes/No. Call the tool directly — do NOT ask
  "shall I confirm?" in prose. State it done ONLY after the call. One write tool per turn.

# EXAMPLES
- "gasté 500 en gasolina" → register_transaction(kind="expense", amount=500, category="Gasolina")
- "me pagaron 20000 de salario" → register_transaction(kind="income", amount=20000, category="Salario")
"""
```

Output language stays controlled separately: `FINANCE_PROMPT.format(language=language_name(state["language"]))`.

## Commands

```bash
# Verify a prompt change did not regress behavior (run after EVERY prompt edit):
make eval                       # ROUTING + MONTO must hold at their bar

# Measure token cost of a prompt (es vs en):
cd apps/api && uv run python -c "import tiktoken; e=tiktoken.get_encoding('o200k_base'); print(len(e.encode(open('/dev/stdin').read())))"
```

## Resources

- **Pattern of record**: `startup/arquitectura-mvp.md` §7.11 + ADR 34.
- **i18n machinery**: `apps/api/src/shared/lang/` (resolve_language) · `apps/api/src/shared/i18n/` (catalog).
- **Eval (safety net)**: `apps/api/evals/finance_eval.py`.

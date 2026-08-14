---
name: cuadra-aispace
description: >
  Structural conventions of Cuadra's AISpace orchestrator (`contexts/aispace`): the `AgentSpec`
  contract, the intent registry, the closure/anti-IDOR tool pattern, the multi-step HITL flow
  engine, the SSE wire protocol + its `agent_run` allowlist, the `language` vs `ui_language`
  split (es/en/pt), and the LangGraph gotchas that already cost this repo a bug. Owns the
  shared-vs-vertical cut line for the FAMILY of Save agents (groceries, cards, loans, insurance).
  Composes with `cuadra-agent-prompts` (prompt TEXT), the global `langgraph` skill (framework)
  and `cuadra-api` (hexagonal/TDD).
  Trigger: Adding or editing an AGENT, an intent, a tool, a HITL flow, the router, the SSE
  frames, or the graph state anywhere under `apps/api/src/contexts/aispace` — and before wiring
  any new sub-agent (GroceriesAgent and its future siblings).
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Division of labour — do NOT duplicate.** This skill owns the *structure* of the orchestrator:
> contracts, wiring, state, transport. The **text** the model reads (system prompts, tool
> docstrings, classifier prompts) belongs to **`cuadra-agent-prompts`**. The **framework** itself
> (Graph API, checkpointers, streaming modes, interrupts) belongs to the global **`langgraph`**
> skill. Hexagonal layering, money and TDD belong to **`cuadra-api`**. Load those alongside this one.

> **Research the state of the art FIRST (2025-2026).** Agent orchestration moves fast. Before
> adding a pattern (supervisor, handoff, fan-out, semantic tool routing), check the current
> LangGraph docs and how shipped agentic products solve it — and be critical about cost/latency
> claims. Flag anything unverified as "to verify", never as fact.

## When to Use

- Adding a **new agent** to the orchestrator (a new vertical: groceries, cards, loans…).
- Adding or changing an **intent**, the **router**, or the **registry**.
- Writing an agent **tool** (`agents/*/tools/*.py`).
- Building a **multi-step HITL flow** (`flows/`), or anything that calls `interrupt()`.
- Touching **`AispaceState`**, the **SSE frames**, or how a reply reaches the chat.

## Critical Patterns

### 1. The `AgentSpec` contract — `run` reads, `commit` writes

```python
@runtime_checkable
class AgentSpec(Protocol):            # agents/base.py
    intents: tuple[str, ...]
    def run(self, state: dict) -> dict:    # → {messages, pending_action, ui_actions?}
    def commit(self, state: dict) -> str:  # executes the CONFIRMED pending_action → reply
```

- `run()` executes the ReAct agent. **Reads answer immediately**; **writes only STAGE** a
  `pending_action` (they do not touch the DB). `commit()` performs the write, after the human confirmed.
- The staging trick: the write tool closes over a plain `staging: dict` and fills it; `run()` returns
  `staging.get("action")`. See `agents/finance/agent.py`.
- **A READ-ONLY agent returns `pending_action: None` and has NO write tool.** That absence is the
  guarantee it cannot mutate — not the path the graph happens to take. An agent may legitimately use
  `interrupt()` to let the user *pick* something (disambiguation) without ever writing.

### 2. Adding an agent = 3 touch points. **`graph.py` is NEVER one of them**

| # | File | Change |
|---|---|---|
| 1 | `agents/<vertical>/agent.py` | the class satisfying `AgentSpec` |
| 2 | `orchestration/registry.py::build_registry` | one entry in the `agents` list |
| 3 | `orchestration/router.py` | the new value in `_IntentOut`'s `Literal` **and** a line in `_CLASSIFY_PROMPT` |

`build_registry` is a **function**, not a static dict, because agents need deps (`session_factory`);
it is assembled in the composition root. The graph receives `registry` + `flow_registry` as
`Mapping`s and knows no concrete agent. **If you find yourself editing `graph.py` to add an agent,
the design is wrong.**

> Name an agent by its **vertical/domain**, never by a verb. `FinanceAgent` (Insights) and
> `GroceriesAgent` (Save · supermarkets) are correct; `PurchasesAgent` is not — "buying" also
> describes buying insurance, so the name does not separate the siblings, and **the intent name is
> part of the classifier's prompt**. Future financial vertical: NOT `FinancialAgent` (indistinguishable
> from `FinanceAgent`, for a human and for the classifier) — use `CardsAgent`, `LoansAgent`, etc.

### 3. Tools: built per invocation, identity bound by CLOSURE (anti-IDOR)

```python
def build_get_monthly_summary(user_id: str, session_factory: SessionFactory):
    @tool
    def get_monthly_summary() -> str:
        """Read the user's CURRENT-MONTH summary… Use for "how much have I spent?"."""  # ENGLISH
        with session_factory() as session:                 # one Unit-of-Work per invocation
            ...
    return get_monthly_summary
```

- **`user_id` is NEVER a tool parameter.** The LLM must not be able to name whose data to read
  (anti-IDOR §12.1). Same for any scope key the user must not choose — e.g. Save's `market_id`,
  which is a public-catalog scope but still closes over, never an argument.
- **The tool returns a compact, already-aggregated STRING** — never row dumps. SQL computes; the
  model only redacts. Money is formatted through `Money.format()` so the model has no integer to
  "helpfully" round.
- One UoW per invocation, one indexed query per tool. No N+1.

### 4. i18n — three languages, TWO different channels. Get this wrong and pt/en break

Cuadra ships **es / en / pt-BR**. There are two distinct kinds of text and they resolve differently:

| | Free LLM text (the agent's reply) | Deterministic strings (chrome) |
|---|---|---|
| Source | the model, guided by the prompt | `shared/i18n` catalog, `t(key, lang, **params)` |
| Language field | **`state["language"]`** — per-message detection may override the locale | **`state["ui_language"]`** — the locale the user CHOSE, never overridden |
| How | `PROMPT.format(language=language_name(lang))` → `"Reply EXCLUSIVELY in português"` | `t("cancelled", lang)` |

- `resolve_language()` (`shared/lang`): client locale is primary; `lingua` detection overrides only
  at ≥0.70 confidence. `client_language()` is the un-overridable one for chrome.
- **Never hardcode a user-facing string in Spanish.** That includes **`ui_actions` link labels**
  (`{"type":"link","text": …}`) and every `Interaction` prompt/option label — they are chrome, so
  they go through `t()` with an `es`/`en`/`pt` entry each (see `see_in_insight`, `expense.*`).
- **Tool return payloads stay language-NEUTRAL** (generic English keys: `income=`, `expenses=`,
  `no_data:`). They must not anchor the reply's language — the agent redacts them into the user's.

### 5. SSE: only `agent_run` reaches the chat — and ReAct agents do NOT stream tokens

`stream_mode="messages"` yields chunks from **every** LLM in the graph. The classifier and the
flow's internal LLMs must never leak into the chat, so `sse.py` **allowlists `langgraph_node ==
"agent_run"`** and drops everything else.

> ⚠️ **The consequence nobody expects.** An agent built with `create_agent` runs a **nested graph**;
> its LLM tokens do not surface in that loop (and would carry the *inner* node name anyway, so the
> allowlist would drop them). `sse.py` therefore has an `if not emitted:` fallback that emits the
> final message **whole**. Practical meaning: **for a ReAct agent, TTFT ≈ total latency** — the chat
> stays silent, then prints everything at once. Any TTFT target for a new ReAct agent must be
> **measured**, not assumed from "streaming is built". Evidence: the fallback itself, its comment,
> and `tests/aispace/unit/test_sse.py::test_stream_emits_coach_message_then_interaction_then_done`.

Frames (generic — this module knows nothing about any domain):

```jsonc
{"type":"token","content":"…"}                  {"type":"interaction","interaction":{prompt,options}}
{"type":"link","text":"…","href":"…"}           {"type":"done","thread_id":"…"}
```

`link` frames come from `state["ui_actions"]` filtered by `type == "link"` — **N per turn**.

### 6. `AispaceState` — the reducer trap, and a stale docstring that lies

`messages` accumulates via `add_messages`. **`ui_actions` does NOT** — it is a plain `list`, i.e.
**overwrite**, on purpose: if it accumulated, last turn's link would be re-emitted forever. It is
reset to `[]` on every new `/chat` input.

> The module docstring of `state.py` still claims `ui_actions` uses `add`. **It does not** — the
> class body has no `Annotated[...]`. Trust the field, not that line.

General rule: LangGraph's default is **overwrite**; a field that must accumulate needs an explicit
`Annotated[list, add]`. This is the #1 source of "lost state" bugs.

### 7. HITL: the flow engine, and what it assumes

`FlowSpec(steps, commit, prepare=None)` + `drive_flow` (`flows/`): one `interrupt()` per step, all
inside ONE node. LangGraph **re-runs the node from the top on every resume**, so:

- `Step.build(state, answers)` **MUST be pure** — accumulate nothing outside `answers`. Return
  `None` to skip a step.
- **All side effects go in `commit`**, reached only after every step is answered. Re-runs are safe.
- `prepare` runs in its **own node** (`prepare_flow`), exactly once, before the interrupt loop — put
  anything expensive (e.g. an LLM suggestion) there, or it re-executes on every resume.
- `CANCEL_VALUES` aborts the whole flow.
- **`commit` is mandatory in `FlowSpec`.** A read-only flow that only disambiguates has no write to
  perform — before building one, verify whether a no-op `commit` is acceptable or the generic
  `pending_action` path fits better. Do not force it.

`interrupt()` **requires a compiled checkpointer**, and every `invoke` needs a `thread_id` in the
config — without it nothing persists and the resume breaks.

### 8. The router: two layers, and the lesson the short-circuit taught

Deterministic regex short-circuits first (free, instant), LLM classifier with structured output
second (`Literal` + Pydantic makes an invalid intent impossible). The classifier is an **injected
`Callable`** → unit-test the node with a fake, no LLM.

> ⛔ **A pattern that matches two intents discriminates neither.** `compr` was in the expense
> short-circuit and matched both *«compré»* (log a past expense) and *«la compra / comprar»* (go
> grocery shopping) — it hijacked every supermarket question containing a digit. It was removed
> (`95fc127`). **Before adding a token to a short-circuit, ask which OTHER intent could contain it.**
>
> This is instance #2 of a defect that has now hit three subsystems (category lexicon → router →
> basket resolution). The full doctrine, the three cases, and why raising a threshold never fixes it
> live in **`cuadra-save` §1b — the discrimination doctrine**. Read it before writing any
> text→entity resolution.
>
> Also: the short-circuit only fires **with a digit present**, and it is narrower than it looks —
> `pagu|pagué` does not match *«pagaron»*. Verify a claim about it with a test, don't read the regex.

The classifier sees **only the last human message** — an elliptical follow-up (*«¿y el aceite?»*)
can fall into `general`. Known limitation; the fix (sticky intent or passing the previous turn)
needs a guard so a long off-topic message breaks the stickiness.

### 9. The family cut line — shared vs vertical

AISpace will host **several** agents over Save (`ProviderType` already has `SUPERMARKET`, `BANK`,
`INSURER`). Before writing any file, ask: **would a credit-cards agent use this?**

| Piece | Shared? | Where it lives |
|---|---|---|
| Fuzzy search, rank fusion (RRF), comparison | ✅ | `save/domain/*` — pure, consumed by every vertical |
| Tool pattern (closure, English docstring, compact output) | ✅ | this skill |
| Grounding + citation rules | ✅ (stricter for finance) | this skill + base prompt |
| Intent registration mechanism | ✅ | already built — don't touch it |
| Household basket, grocery query groups | ❌ | `save/domain/basket.py`, honestly specific |

⛔ **Anti-pattern: the `SaveAgent` that knows everything.** One agent comparing rice *and* interest
rates needs a prompt mixing unrelated domains and an unbounded tool catalog — selection accuracy and
cost both degrade. **One agent per vertical.** The router already knows how to split traffic.

> **Tool-count tripwire:** all tools in context is correct at ~7. Past **~10 tools**, or if tool
> selection accuracy drops under 90%, revisit and add semantic tool routing. Every new tool must
> justify why it isn't a parameter of an existing one.

## Rendimiento de la pantalla del chat (medido en device 2026-08-14: JS 45 fps / UI 36 fps escribiendo)

`chat-screen.tsx` son ~860 líneas **con la lista de mensajes dentro**. Cualquier estado que viva ahí
y cambie seguido re-renderiza TODO — y el coste crece con el largo de la conversación.

1. **Nada que cambie por TECLA puede vivir en el estado de `chat-screen`.** El borrador estaba en un
   `useState` de la pantalla y se publicaba con `onChangeText`: cada carácter re-renderizaba la
   pantalla entera, cuando el ÚNICO consumidor era `QuickActions`. Ahora vive en
   `store/chat-draft-store.ts` — el input escribe, `QuickActions` lee, la pantalla ni se entera.
   ⚠️ Leerlo SIEMPRE con selector (`useChatDraftStore((s) => s.draft)`); desestructurar el store
   entero resuscribe a todo cambio y deshace el arreglo.
2. **Toda fila de la lista va `memo()`.** `AgentMessage`, `UserBubble`, `ProductCard`,
   `ProviderProductsCard` y `BasketCard` estaban SIN memoizar, así que cada re-render de la pantalla
   arrastraba todas las filas. Es el multiplicador del punto 1: sin memo, un re-render cuesta O(n)
   mensajes.
3. **Verificá el arreglo MUTANDO el cable, no sólo corriendo los tests.** El acoplamiento
   pantalla→sugerencias ya tuvo un hueco silencioso antes (borrar `draft={draft}` dejaba la suite
   verde). Tras mover el borrador al store se re-mutó (`const draft = ""`) y caen 2 tests: el cable
   sigue protegido.
4. **Un SVG a pantalla completa que CAMBIA DE CAJA se re-rasteriza en cada frame.** `CardGradient`
   era `absoluteFill` dentro de la tarjeta, y la tarjeta cambia de alto en cada frame del teclado:
   un degradado de pantalla entera redibujándose 60 veces por segundo en el hilo de UI. Arreglo:
   **alto FIJO anclado arriba** (`height={windowH}`), y que lo recorte `cardClip` — el trozo que se
   pierde es la cola transparente del degradado, detrás del dock. Midió **UI 40 → 45 fps**.
   > Regla general: dentro de un contenedor cuyo tamaño se anima, ningún hijo debe depender de ese
   > tamaño si puede evitarse. Vale para SVG, blur y máscaras.

5. **El `marginBottom` animado de la tarjeta (`shadowStyle`) anima LAYOUT, no transform** — Yoga
   re-maqueta todo el subárbol de la tarjeta en cada frame. Es el techo actual: **~45 fps de UI**
   durante los ~250 ms que dura la subida.
   **DECIDIDO (2026-08-14): se queda así.** Llevarlo a 60 exige que la tarjeta deje de encogerse y
   pase a `translateY`, y eso saca su borde superior de pantalla mientras se escribe — rompe la
   decisión de diseño explícita de este archivo (*«SLIDES UP intact rather than being squished»*,
   *«sit flush on the keyboard»*). Cambiar el diseño por 15 fps en un cuarto de segundo es mal
   negocio. **No lo "arregles" por reflejo.**

### Lo que YA se descartó midiendo (no repitas el diagnóstico)

| Sospechoso | Veredicto | Cómo se probó |
|---|---|---|
| El vidrio líquido (`GlassSurface`) redimensionándose | **INOCENTE** | flag temporal que lo cambia por una `View` opaca: los fps no se movieron |
| Las filas de la lista re-maquetando | **INOCENTE** | con el chat VACÍO marcaba lo mismo |
| `CardGradient` (SVG full-screen) | **CULPABLE (parcial)** | alto fijo → UI 40 → 45 |
| El `marginBottom` animado | **CULPABLE (el resto)** | por descarte de los tres anteriores |

**Método**: una variable por vez, con un flag temporal que se BORRA al tener la respuesta (no queda
como feature flag). Y ojo con comparar capturas de escenarios distintos: «JS 38» con el agente
respondiendo NO es comparable con «JS 60» escribiendo en un chat vacío — son cargas distintas.

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Add an agent via registry + intent + prompt line | Edit `graph.py` to add an agent |
| Bind `user_id` / scope by closure | Expose them as tool parameters |
| Return compact aggregated strings from tools | Dump rows and let the model compute |
| `t(key, ui_language)` for every chrome string | Hardcode Spanish in a link label or option |
| Measure TTFT for a new ReAct agent | Assume it streams because "SSE is built" |
| Keep `Step.build` pure; side effects in `commit` | Mutate outside `answers` (the node re-runs) |
| Name the agent by its vertical | Name it by a verb (`PurchasesAgent`) |

## Commands

```bash
cd apps/api                                   # uv resolves the venv by CWD — always cd first
uv run pytest tests/aispace -q                # the whole orchestrator
uv run pytest tests/aispace/unit -q           # no DB, no LLM (fakes + MemorySaver)
uv run pytest tests/aispace/integration -q    # real LLM; auto-skips without an API key
make eval                                     # FinanceAgent routing/amount eval — run after ANY prompt edit
uv run ruff check src tests && uv run mypy src && uv run lint-imports
```

## Resources

- **Contracts**: `agents/base.py` · `orchestration/{registry,graph,router,state,sse,handoff}.py` · `flows/{base,driver}.py`
- **Reference agent**: `agents/finance/` (ReAct + staged write + read tools)
- **i18n machinery**: `src/shared/lang/` (resolution) · `src/shared/i18n/` (es/en/pt catalog)
- **Plan of record for the first Save agent**: `docs/aispace-groceries-agent.md`
- **Companion skills**: `cuadra-agent-prompts` (prompt text) · `langgraph` (framework) · `cuadra-api` (layering/TDD) · `cuadra-save` (the domain)

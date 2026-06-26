# Diseño — AISpace · Orquestador del Chat IA (FinanceAgent, primer slice)

> **Fase SDD:** design. **Deriva de** `startup/arquitectura-mvp.md` §7 y del spike
> (`startup/spike-orquestador.md`, 6/6 PASS → GO). **Estado:** propuesta para aprobar antes de `tasks`/`apply`.

## 1. Alcance

Llevar a **producción** (context-first, con tests) la mecánica que el spike validó: el grafo
**router-a-nodos** con checkpointer Postgres + HITL, **reusando los casos de uso de Insights
como tools determinísticas** (§7.3). El triángulo Insights × AISpace, de verdad.

**Primer slice = SOLO FinanceAgent.** Difiere (slices siguientes, patrón ya probado):
Purchases/Coach/Support, memoria semántica (§7.5), streaming a la UI (§7.6), router encoder-only (§7.1).

**Voz:** NO va en el backend. §7.7 = **STT on-device** (iOS/Android) en el móvil; el backend recibe
**texto**. (El Whisper del spike fue solo para probar el pipeline; no es producción.)

## 2. Estructura de directorios (diseñada para escalar)

> Investigada externamente (docs LangGraph/LangChain multi-agente) + destilada del proyecto de
> reuso `fiscal-contable.agentic-ai-app/backend` (`sub_agents/` + `orchestrator/`). **Adoptamos sus
> patrones probados; EVITAMOS su anti-patrón** (los agentes vivían como *legacy sibling* de `src/`,
> fuera del hexagonal — ver §17.2 del padre). Aquí van **DENTRO** del contexto (ADR 1, §4).

```
contexts/aispace/
  orchestration/              # EL GRAFO y su mecánica (no conoce agentes concretos)
    state.py                  #   IAMState (§7.2)
    graph.py                  #   build_graph(): router → nodos → compile(checkpointer)
    router.py                 #   classify_intent: triggers (cortocircuitos §7.8) + LLMPort structured
    registry.py               #   INTENT→AgentSpec — añadir un agente NO toca el grafo (registry pattern)
    nodes.py                  #   adaptadores: envuelven cada agente como nodo del grafo
    hitl.py                   #   interrupt() + resolución de pending_action (§7.4)
    handoff.py                #   select_new_agent — contrato desde el día 1 (§7.1)
  agents/                     # UN AGENTE = UNA CARPETA, contrato común
    base.py                   #   AgentSpec (Protocol): build()->CompiledAgent + intents que maneja
    finance/
      agent.py                #   create_agent(modelo + tools + prompt + middleware)
      prompt.py               #   system prompt del FinanceAgent (versionable, no inline)
      tools/
        transactions.py       #   register_transaction → RecordTransaction (Insights)
        metrics.py            #   get_metrics / get_balance → GetInsightsMetrics (Insights)
    # purchases/ coach/ support/  ← se añaden IGUAL, sin tocar orchestration/
  infrastructure/
    checkpointer.py           #   PostgresSaver provider (singleton de app, lifespan · D3)
    middleware.py             #   1-tool-por-step (anti-race) + cap del loop ReAct (ADR 28)
src/api/v1/controllers/aispace.py   # POST /v1/aispace/chat (+ /resume)
```

`shared/llm` (`LLMPort`, §7.8) provee el modelo; los agentes hablan con el puerto, no con un SDK.

### 2.1 Principios de escalabilidad (las reglas que evitan que esto se pudra)

1. **Un agente, una responsabilidad, una carpeta** (best practice multi-agente: *narrow agents*). Su
   prompt, sus tools y su build viven juntos en `agents/<x>/`.
2. **Registry-driven** (`orchestration/registry.py`): el router clasifica a un `intent`; el grafo
   resuelve el agente por el registry. **Añadir un agente = nueva carpeta + 1 línea en el registry;
   el grafo NO se toca.** (Patrón del reuso: "añadir sub-agentes sin tocar el orchestrator".)
3. **Tools agrupadas por capability** (`tools/transactions.py`, `tools/metrics.py`), NUNCA un
   `tools.py` gigante. Cada módulo expone un builder `build_*_tools(user_id, session_factory)`.
4. **Scope ligado por CLOSURE (anti-IDOR §12.1)**: el builder inyecta `user_id` (del JWT) en el
   closure de cada tool. El LLM **solo provee argumentos de negocio**, NUNCA el `user_id` — un IDOR
   por prompt injection queda imposible. (Lección directa del reuso.)
5. **Las tools son ADAPTADORES a la aplicación de otros contextos**, no lógica nueva:
   `register_transaction` envuelve `RecordTransaction` de Insights. aispace depende del **contrato**
   de la aplicación de insights, no de su infra → el hexagonal se respeta entre contextos.
6. **Middleware compartido** (`infrastructure/middleware.py`): `parallel_tool_calls=False` (anti-race
   en mutaciones) + cap del loop ReAct (ADR 28). Aplicado por agente al construirlo.
7. **`orchestration/` no conoce agentes concretos** (depende del registry + `base.py`); **`agents/`
   no conoce el grafo**. Acoplamiento en una sola dirección → se prueban por separado.

## 3. Estado del grafo (§7.2)

```python
class IAMState(MessagesState):          # messages: add_messages
    user_id: str
    capabilities: list[str]             # gobierna qué tools puede usar (RBAC §12.1)
    intent: str
    pending_action: dict | None         # acción a confirmar (HITL)
    ui_actions: Annotated[list, add]    # botones/tarjetas en el chat (reducer add)
```

## 4. Grafo (MVP = ruta única, §7.1)

```
START → classify_intent → (route) ─ finance → confirm(interrupt) → finalize → END
                                  └ (otro) ──────────────────────→ format → END
```

- **classify_intent**: cortocircuitos deterministas (regex de monto, §7.8) → si no, LLMPort con
  `structured_output(Literal["register_expense","query_metrics","other"])`. Modelo barato.
- **finance**: extrae args con el LLM (SOLO extrae) → `pending_action` (no escribe aún).
- **confirm (HITL §7.4)**: `interrupt()` → confirmación en el chat → `Command(resume=...)`.
- **finalize**: ejecuta la tool determinística (que envuelve el use case de Insights) y redacta.
- **handoff**: `select_new_agent` como tool/stub desde ya (con 1 agente es no-op, pero el contrato
  queda) → al añadir agentes no se rediseña (§7.1).

## 5. Decisiones de arquitectura (las que importan)

### D1 — Las tools son dueñas de su UoW (no hay sesión por-request que sobreviva el HITL)
El grafo **pausa en `interrupt()` a través de requests HTTP** (request 1 = mensaje; request 2 =
resume). Por eso **NO** se puede pasar una `Session` request-scoped al grafo (la de la request 1 ya
no existe en la 2). **Decisión:** cada tool abre su propia `Session`/UoW, llama al use case de
Insights y commitea — atómico y autocontenido. (Es lo que hizo el spike con su conexión propia.)
Implementación: una factory `session_factory()` inyectada a las tools por el composition_root.

### D2 — Reuso REAL de Insights (no reimplementar nada)
`register_transaction(user_id, amount, category, merchant)` → construye el `Transaction` de dominio
y llama **`RecordTransaction`** (idempotente §12·C, RBAC §12.1) con repos SQL reales. La aritmética
minor-units y la escritura viven en el use case, **nunca en el LLM** (§7.3). Igual `get_metrics` →
`GetInsightsMetrics`. El LLM solo extrae args y redacta.

### D3 — Checkpointer Postgres como singleton de app (lifespan)
`PostgresSaver` necesita conexión persistente. **Decisión:** instanciar UNA vez en el `lifespan` de
FastAPI (no por request) y compilar el grafo con él. `thread_id` = id de conversación del usuario (§7.5).

### D4 — MVP sin streaming (slice 2)
La API responde **JSON** (turno completo) primero — testeable RED-first. El streaming
`stream_mode="messages"` por SSE/WS (§7.6) es un slice aparte. El contrato de respuesta deja lugar
para `ui_actions`.

### D5 — Memoria semántica diferida
§7.5 (resumen + embedding pgvector + retrieval) es **fase 1**, no este slice. El checkpointer ya da
memoria de CORTO plazo (estado de la conversación). Largo plazo después.

### D6 — RBAC de tools por capabilities
`state.capabilities` filtra qué tools puede invocar el agente (mínimo privilegio §12.1). En el MVP
(rol Usuario Normal) Finance tiene todas; el contrato queda para cuando entren más roles.

## 6. API (contrato)

```
POST /v1/aispace/chat
  body: { "message": str, "thread_id": str | null }   # thread_id null = nueva conversación
  → 200 { "thread_id", "reply": str, "pending_action": {...} | null, "ui_actions": [...] }
       · pending_action != null  → el grafo está PAUSADO esperando confirmación (HITL)

POST /v1/aispace/chat/resume
  body: { "thread_id": str, "approved": bool }
  → 200 { "thread_id", "reply", "ui_actions" }          # ejecuta o cancela el pending_action
```
`user_id` del JWT (igual que Insights/Identity). Errores → ProblemDetails.

## 7. Modelo / LLM

Vía `LLMPort` (`init_chat_model`, §7.8). Router + extractor = modelo **barato** (Haiku en prod,
gpt-4o-mini en dev por `LLM_PROVIDER`). `temperature=0` para determinismo de routing/extracción.

## 8. Plan de tasks (RED-first) — ESTADO

1. ✅ `IAMState` + `build_graph` (registry-driven) — unit con MemorySaver.
2. ✅ `classify_intent` (cortocircuitos + `llm_classifier` inyectable) — unit.
3. ✅ Tool `register_transaction` → `RecordTransaction` (UoW propia D1/D2, scope por closure) — integración.
4. ✅ `FinanceAgent.plan/execute` + `confirm` (HITL `interrupt`) — unit (fakes) + integración (LLM real).
5. ✅ `POST /v1/aispace/chat` + `/resume` + composition_root + checkpointer singleton — integración HTTP.
6. ✅ `handoff.py` (contrato `request_handoff`, sin cablear). 🔲 RBAC **capability-gate** diferido (ver §9).

> **159 tests verdes, 0 regresiones** (12 nuevos de aispace, RED-first).

### Refinamientos durante `apply` (decisiones registradas)
- **FinanceAgent v1 = flujo DETERMINISTA** (extraer→confirmar→ejecutar), NO `create_agent`/ReAct. Con
  UNA tool de escritura + HITL obligatorio, ReAct añade costo/no-determinismo sin valor. Migra a
  `create_agent` cuando el agente tenga varias tools y el LLM deba ELEGIR. La estructura (tools/,
  registry, closure-binding) ya queda lista para esa migración.
- **Checkpointer = singleton perezoso** en `composition_root` (no en `lifespan`): no acopla el
  arranque a la DB ni corre en tests de otros contextos.

## 9. Fuera de este slice (explícito)
- **RBAC capability-gate (D6)**: el anti-IDOR (user_id por closure) YA está; falta resolver las
  `capabilities` del usuario desde identity e inyectarlas al estado para gatear qué agente/tool puede
  usar. No-op hoy (un solo rol con todo); se cablea cuando entren más roles.
- **Resolver `capabilities` reales** en el controller (hoy va `[]`).
- Migración a `create_agent`/ReAct cuando Finance sume tools (income/transfer, get_metrics, etc.).
- Purchases/Coach/Support · fan-out del triángulo (Coach) · streaming SSE/WS (§7.6) · memoria
  semántica pgvector (§7.5) · router encoder-only · voz (on-device en el móvil).
```

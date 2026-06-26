# 🧪 Spike — Orquestador AISpace (router-a-nodos, end-to-end)

> **Qué es:** investigación técnica **time-boxed y DESECHABLE** que prueba que el corazón agéntico de
> Cuadra funciona, **antes** de construir los 4 agentes y el sistema completo. No es código de
> producción — es código de **aprendizaje** (se tira; se conservan los hallazgos).
>
> **Deriva de** [`arquitectura-mvp.md`](./arquitectura-mvp.md) §16 (ítem 4) y §7. **Time-box: 3-5 días.**

---

## 1. La pregunta que responde

> *¿El patrón **router-a-nodos + checkpointer Postgres + HITL** procesa un **gasto por voz**
> end-to-end, con números 100% determinísticos, a costo y latencia aceptables?*

Si **sí** → construimos los otros 3 agentes (Purchases/Coach/Support) copiando el patrón probado.
Si **no** → lo descubrimos ahora, con 1 agente, no después de construir 4.

## 2. Alcance — deliberadamente MÍNIMO

| DENTRO del spike | FUERA (no lo toca) |
|---|---|
| Router (clasificación) | Los 4 agentes — **solo FinanceAgent** |
| 1 tool: `register_transaction` | Save, News, enriquecimiento, perfil financiero |
| Checkpointer Postgres + `interrupt()` | La estructura context-first de producción |
| Voz: audio → transcript → grafo | STT on-device (eso es mobile, §7.7) |
| Medición de costo/latencia | UI, mobile, offline-first |

> **Regla:** carpeta/venv aparte, throwaway. **NO** se construye sobre el monorepo de producción.

## 3. Prerrequisitos (T0 — setup)

- Python + `langgraph`, `langgraph-checkpoint-postgres`, `langchain-anthropic`, `fastapi`.
- Postgres local (docker) — solo para los checkpoints + una tabla `transaction` mínima.
- API key de Claude (Haiku) + (para T5) una STT cloud (Whisper/Deepgram).
- **✅ Criterio de éxito T0:** un grafo trivial de 1 nodo **compila, corre y deja un checkpoint** en Postgres.

---

## 4. Tareas (cada una con criterio de éxito verificable)

### T1 — State + esqueleto del grafo
- Definir `SpikeState` (`MessagesState` + `user_id`, `intent`, `pending_action`).
- `StateGraph`: `classify_intent → finance_agent → await_approval(interrupt) → format → END`.
- Compilar con checkpointer Postgres + `thread_id`.
- **✅ Éxito:** un mensaje no-op atraviesa el grafo de punta a punta y el **estado persiste** (aparece una fila de checkpoint por `thread_id`).

### T2 — Router (`classify_intent`) con structured output
- Nodo LLM (Haiku) con `with_structured_output(Literal["register_expense","query_balance","other"])`.
- 1-2 cortocircuitos deterministas (regex de monto, p.ej.).
- **✅ Éxito:** sobre un set de **10 frases etiquetadas**, ≥ **9/10** ruteadas correctas. `"gasté 500 en gasolina"` → `register_expense`.

### T3 — FinanceAgent + tool determinística `register_transaction`
- `create_agent` (ReAct) con UNA tool: `register_transaction(amount_minor, category, merchant)` que **valida + persiste** en `transaction` (minor units, BIGINT).
- El LLM **solo extrae args**; la tool hace la aritmética y la escritura.
- **✅ Éxito:** `"gasté 500 en gasolina"` → tool llamada con `amount_minor=50000, category="transport"`; se inserta la fila; **el LLM nunca calcula el monto** (verificado en la traza LangSmith: el número sale de la tool, no del texto del modelo).

### T4 — HITL con `interrupt()`
- Antes de la escritura, `interrupt()` → devuelve prompt de confirmación → `Command(resume="sí")` commitea; `"no"` cancela.
- **✅ Éxito:** el grafo **pausa** en el interrupt (checkpoint guardado); una **segunda invocación con el mismo `thread_id`** y `resume="sí"` commitea la transacción; con `"no"` no inserta nada. El estado **sobrevive la pausa**.

### T5 — Entrada por voz (audio → transcript → grafo)
- Pipeline: archivo de audio → STT cloud → transcript → entra al grafo (mismo flujo que texto, §7.7 dice que voz es un flag sobre el mismo pipeline).
- **✅ Éxito:** un clip `"gasté quinientos en gasolina"` → transcript → **registra el gasto end-to-end** (mismo resultado que T3 pero entrando por audio).

### T6 — Medición (unit economics + latencia)
- Correr el flujo e2e **N=20 veces**; medir con LangSmith: **tokens/costo por interacción** y **latencia p50/p95**.
- **✅ Éxito:** costo/interacción **< $0.01** (con Haiku + prompt caching) y **p95 e2e < 4 s** (sin contar STT). Si se excede, queda documentado como riesgo de §12·D.

### T7 — Hallazgos + decisión (go/no-go)
- Escribir 1 página: ¿el patrón aguantó? sorpresas, gotchas, qué cambiar en §7 si algo.
- **Tirar el código**, conservar los hallazgos.
- **✅ Éxito:** decisión explícita **GO / NO-GO** para construir el orquestador completo, con evidencia.

---

## 5. Criterio de éxito GLOBAL (la compuerta)

El spike es **exitoso** si, en verde, demuestra:

- [ ] **voz → router → FinanceAgent → tool → HITL → persistencia** funciona end-to-end.
- [ ] el **estado persiste** a través del `interrupt()` vía checkpointer Postgres (T4).
- [ ] el **LLM nunca hace aritmética** — los números salen de la tool (T3, verificado en traza).
- [ ] **costo y latencia** dentro de los targets (T6).

→ **GO:** se construye el orquestador completo (4 agentes) sobre este patrón probado, en la estructura
de producción (`contexts/aispace/`, [`estructura-monorepo.md`](./estructura-monorepo.md)).
→ **NO-GO:** se ajusta §7 (router, checkpointer o modelo) y se re-spikea el punto que falló.

## 6. Qué NO es éxito (anti-criterios)

- ❌ "El agente respondió bonito" — eso no prueba nada; el criterio es la **mecánica end-to-end + la persistencia + el determinismo del número**.
- ❌ Construir los 4 agentes "ya que estamos" — eso deja de ser spike y se vuelve producción sin validar.
- ❌ Conservar el código del spike como base — es **desechable** por diseño.

---

> *Mapea 1:1 a §7 del padre: router (§7.1/§7.8) · tool determinística (§7.3) · HITL (§7.4, ADR 30) ·
> checkpointer (§7.5) · voz (§7.7) · unit economics (§12·D). El spike gemelo de Save está en §16·3.*

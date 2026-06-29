# 🗣️ AISpace — Agente conversacional ("General") + fix de idioma

> **Estado:** ✅ IMPLEMENTADO (2026-06-29, rama `feat/chat-mvp-integration`) — **con una extensión:
> la personalidad es CONFIGURABLE** (modos estilo Cleo: 😐 Neutro · 🎉 Coach · 🔥 Roast), no un único
> tono fijo. Default **Coach**. Persistida en backend (tabla `aispace.user_preference`) y elegible
> desde el móvil (Config → "Personalidad del copiloto"). Ver §9.
> **Deriva de:** [`arquitectura-mvp.md`](../arquitectura-mvp.md) §7 (orquestador router-a-nodos),
> §7.11 (multilenguaje) · [`aispace-orquestador.md`](./aispace-orquestador.md) ·
> [`../research/cleo-analisis.md`](../research/cleo-analisis.md) §6 (la personalidad como producto).
> **Decisión del usuario (2026-06-29):** habilitar la conversación con un **agente dedicado**
> (`AgentSpec` en el registry), NO un fallback canned ni un simple branch; **personalidad
> configurable** (el usuario elige el tono, como los modos Roast/Hype de Cleo).
> **Al implementar, cargar la skill `cuadra-agent-prompts`** (instrucciones en INGLÉS, responder en
> el idioma del usuario).

---

## 1. Problema (por qué HOY no conversa)

Probado en device: "Hola" → *"(AISpace) For now I handle your finances. More soon."* (texto fijo, en
inglés). Dos causas independientes:

1. **No hay agente conversacional.** El registry (`registry.py`) solo cablea `FinanceAgent`
   (`intents = ("register_expense", "query_metrics")`). Todo lo demás → `intent="other"` → el nodo
   `respond_other` del grafo, que devuelve un **string FIJO** `t("other")` (`shared/i18n`). Nunca
   llama al LLM → no conversa.
2. **Responde en inglés.** `resolve_language` (`shared/lang`) usa el **locale del device como señal
   primaria**; el override por-mensaje solo dispara con confianza ≥ 0.70, y textos cortos ("Hola")
   no llegan → gana el locale del iPhone (inglés). El mobile manda `Intl…resolvedOptions().locale`
   (idioma del DEVICE), no el de la app.

---

## 2. Objetivo

AISpace **conversa con personalidad** (cálido, breve, "coach" estilo Cleo — `arquitectura-mvp.md`
§1.1/§7.10): saluda, hace smalltalk acotado, y **reconduce con calidez a lo financiero**; responde
**en el idioma del usuario**; y si el usuario pasa a hablar de plata, **deriva al FinanceAgent**
(handoff, ADR 30). No es un chatbot general sin límites: mantiene la identidad de copiloto financiero.

---

## 3. Diseño

### 3.1 Nuevo agente `GeneralAgent` (`AgentSpec`)

`src/contexts/aispace/agents/general/agent.py` — cumple el `Protocol` `AgentSpec`:

- `intents = ("general",)` (o `"chitchat"`).
- `run(state)`: **una llamada LLM simple** (NO `create_agent` con tools — conversar no necesita
  tools), tier `fast` (`gpt-4o-mini` / Haiku → barato). Devuelve
  `{"messages": [AIMessage(reply)], "pending_action": None}`. Sin HITL.
- `commit(state)`: no aplica (no escribe) → `return ""` (`# pragma: no cover`).
- Prompt en INGLÉS con `{language}` inyectado (mismo patrón que `FINANCE_PROMPT`), ver §3.4.

> **Por qué LLM simple y no `create_agent`:** la conversación no ejecuta tools; un
> `get_chat_model("fast").invoke([SystemMessage(prompt), *state["messages"]])` basta y es más barato.
> El handoff (§3.5) puede sumar tools después.

### 3.2 Router — clasificar smalltalk a `general`

`router.py`:
- Ampliar `_IntentOut` Literal: `Literal["register_expense", "query_metrics", "general"]`
  (quitar/renombrar `"other"`; ver §3.3).
- El prompt del clasificador debe mapear saludos / cómo estás / off-topic / agradecimientos →
  `"general"`.

### 3.3 `respond_other` pasa a ser red de seguridad (no la conversación)

Hoy `route_by_intent` (`graph.py`) hace: `intent in registry → agent_run else respond_other`. Al
registrar `GeneralAgent` para `"general"`, el clasificador ya no debería emitir `"other"`.
- Dejar `respond_other` SOLO como fallback de seguridad (intent desconocido / clasificador caído).
- `t("other")` se mantiene como ese salvavidas, no como la respuesta a un "Hola".

### 3.4 Prompt (borrador — refinar con `cuadra-agent-prompts`)

```text
# LANGUAGE — TOP PRIORITY
Reply EXCLUSIVELY in {language}.

# ROLE
You are AISpace, Cuadra's friendly financial copilot. Chat warmly and briefly (1–3 sentences).
You can greet, make small talk, and answer light questions, but you gently steer the conversation
back to the user's money — budgeting, expenses, saving, prices.

# BOUNDARIES
- You are NOT a general-purpose assistant. For requests unrelated to personal finance, acknowledge
  kindly and redirect to what you CAN do (track spending/income, show balance, safe-to-spend).
- Never invent financial figures. If the user wants to log or query money, say you'll help and let
  the finance flow take over (the system routes it).

# TONE
Warm, encouraging, concise. Light emoji ok (sparingly). No walls of text.
```

### 3.5 Handoff a FinanceAgent (stretch — ADR 30)

Si el usuario pasa a money mid-chat ("oye, gasté 500"), el `GeneralAgent` debería derivar. Dos vías:
- **Simple (recomendado MVP):** el clasificador ya rutea cada turno → el siguiente mensaje
  financiero va directo al FinanceAgent (no hace falta handoff explícito porque el router corre
  por-turno).
- **Handoff explícito (fase):** tool `select_new_agent` (patrón Swarm) si el agente detecta el
  cambio dentro del mismo turno. Marcar como futuro.

---

## 4. Fix de idioma (relacionado — incluir en este slice)

Que "Hola" responda en español. Opciones (elegir, no excluyentes):

1. **Mobile manda el idioma de la APP, no el del device.** En `use-chat.ts`/`chat-stream.ts`,
   enviar el locale resuelto por la i18n de la app (`src/i18n` `resolveLang`/preferencia del usuario)
   en vez de `Intl.DateTimeFormat().resolvedOptions().locale`. **(Recomendado — la fuente correcta.)**
2. **Bajar el umbral de override** `_OVERRIDE_CONFIDENCE` (hoy 0.70) o confiar más en la detección
   para es/en/pt en textos cortos. Riesgo: falsos overrides en mensajes muy cortos/ambiguos.

> Idealmente (1): el usuario eligió el idioma de la app → esa es la señal primaria, no el SO.

---

## 5. Tareas (checklist)

- [ ] `agents/general/agent.py` — `GeneralAgent` (`AgentSpec`): `run` (LLM simple, prompt
      personalidad + `{language}`), `intents=("general",)`, `commit` no-op.
- [ ] `agents/general/__init__.py`.
- [ ] `registry.py` — registrar `GeneralAgent` (sin deps de DB; o con las que necesite).
- [ ] `router.py` — `_IntentOut` incluye `"general"`; prompt del clasificador mapea smalltalk→general.
- [ ] `graph.py` — `respond_other` queda como fallback de seguridad (no la conversación).
- [ ] **Idioma:** mobile envía el idioma de la app (`use-chat.ts`); y/o ajustar `resolve_language`.
- [ ] Tests (RED-first):
  - [ ] router: "hola"/"cómo estás"/"gracias" → `general`; "gasté 500…" → `register_expense`;
        "mi balance" → `query_metrics`.
  - [ ] grafo/endpoint: `intent="general"` → respuesta del LLM (no el canned `t("other")`).
  - [ ] idioma: mensaje en español → respuesta en español (no inglés).
- [ ] `make openapi` (sin cambios de contrato esperados; el endpoint no cambia).
- [ ] Verificar en device: "Hola" → saludo cálido en español; "gasté 500…" → confirmación HITL.

## 6. Criterios de aceptación

- "Hola" / smalltalk → respuesta **del LLM, con personalidad, en el idioma del usuario** (no el
  string fijo, no inglés cuando el usuario escribe en español).
- Los flujos financieros (registrar / balance / safe-to-spend) **siguen igual** (FinanceAgent + HITL).
- Sin convertirse en chatbot general: off-topic se reconduce a finanzas.
- Coste controlado: tier `fast`.

## 7. Archivos relevantes

- `apps/api/src/contexts/aispace/orchestration/registry.py` — registrar el agente.
- `apps/api/src/contexts/aispace/orchestration/router.py` — `_IntentOut` + prompt del clasificador.
- `apps/api/src/contexts/aispace/orchestration/graph.py` — `respond_other` (fallback).
- `apps/api/src/contexts/aispace/agents/base.py` — contrato `AgentSpec` (referencia).
- `apps/api/src/contexts/aispace/agents/finance/agent.py` — patrón de prompt a imitar.
- `apps/api/src/shared/lang/__init__.py` — `resolve_language` (fix idioma).
- `apps/mobile/src/features/aispace/use-chat.ts` / `chat-stream.ts` — enviar el idioma de la app.

## 8. Riesgos / decisiones abiertas

- **Scope creep a chatbot general** → mitigado por el prompt (BOUNDARIES) + identidad financiera.
- **Handoff explícito** (§3.5) — decidir si MVP o fase (recomendado: por-turno basta al inicio).
- **Idioma:** confirmar si el mobile ya tiene preferencia de idioma persistida o usa el del device.

---

## 9. Estado de implementación (2026-06-29) ✅

Implementado en `feat/chat-mvp-integration` en 4 slices RED-first. **Extensión sobre el plan
original:** la personalidad es CONFIGURABLE (3 modos estilo Cleo), no un tono fijo.

**Personalidad configurable (decisión del usuario):**
- Modos: `Personality` enum = NEUTRAL 😐 / COACH 🎉 / ROAST 🔥. **Default COACH** (cálido con carácter,
  sin el sarcasmo del Roast — más seguro para el público RD/LatAm; el Roast es opt-in).
- Persistida en backend: tabla `aispace.user_preference` (`user_id` PK ref. por ID a identity, SIN
  FK cross-context; sin fila → default COACH). Sub-dominio `contexts/aispace/preferences/`.
- El prompt del `GeneralAgent` inyecta `{language}` + `{personality}` (un bloque de tono por modo),
  mismo patrón que `{language}`. BOUNDARIES financieros en los 3 modos.

**Slices:**
- **A** — `GeneralAgent` (LLM simple, tier fast, modelo inyectable), `Personality` enum,
  `AispaceState.personality`, registry, router (`_IntentOut += "general"` + prompt clasificador),
  `respond_other` = red de seguridad. Tests unit (modelo falso) + integración (LLM real).
- **B** — Persistencia: `PreferenceRepository` (puerto) + `SqlPreferenceRepository` (upsert) +
  modelo + migración `e7a1c9d4b2f0`; endpoints `GET/PUT /v1/aispace/preferences` (Personality enum
  → 422 inválido); `/chat` y `/chat/stream` cargan la personalidad al estado.
- **C** — Fix de idioma: el móvil manda el idioma de la app (`getLanguage()` de i18n) como `locale`,
  NO el del device (`Intl`). `resolve_language` ya lo trataba como señal primaria.
- **D** — Móvil: selector en **Config → "Personalidad del copiloto"** (stack anidado en el tab
  Config → vuelta atrás por flecha O tocando el tab Config). Radio group de los 3 modos sobre
  `GET/PUT /aispace/preferences` (TanStack Query, update optimista). Además: texto del chat más
  grande (`text-base` → `text-lg`).

**Pendiente / futuro:** handoff explícito (§3.5) sigue siendo fase; el ROAST en producción conviene
vigilarlo con LLM-as-judge de tono (cleo-analisis §4.3, FTC §8).

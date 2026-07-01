# 🧩 Chat Home Widgets — estado y roadmap

> **Contexto:** `aispace` mobile (chat empty state) + futuro `identity`/`aispace preferences` (catálogo).
> **Estado:** Fase 1 (4 widgets fijos, placeholder) **implementada**. Fase 2 (catálogo
> configurable) y Fase 3 (wiring a flows reales en vez de mensajes de texto) **NO implementadas** —
> quedan documentadas aquí para retomar en otra sesión.
> **Fecha:** 2026-07-01.

---

## 1. Visión completa (lo que pidió el usuario)

Cuando el chat de AISpace todavía no tiene ningún mensaje, en vez de una pantalla vacía se muestra
un saludo + 4 "widgets" (Figma "What's up") que el usuario puede tocar para disparar una acción
rápida (registrar ingreso/gasto/ahorro, mostrar balance).

La idea completa (no implementada todavía):
1. El usuario tendrá un **catálogo** de widgets disponibles — más de 4 opciones para elegir.
2. Podrá **arrastrar/seleccionar** cuáles le interesan mostrar en esta sección — siempre son
   **4 widgets fijos** en pantalla, pero CUÁLES son esos 4 es configurable por el usuario.
3. Al tocar un widget hoy se envía un mensaje de texto plano al chat (igual que QuickActions). La
   idea final es que cada widget dispare **directamente el flow/workflow correspondiente** (p. ej.
   el widget "Registrar ingreso" podría saltar directo al HITL de registro en vez de pasarlo por
   NLU/routing de un mensaje de texto) — a definir junto con el equipo de flows.

---

## 2. Fase 1 — hecho esta sesión (branch `feat/chat-mvp-integration`)

- Nuevo componente `apps/mobile/src/features/aispace/components/chat-empty-state.tsx`: 4 widgets
  **fijos** (Ingresos/Gastos/Ahorros/Balance), colores del rol de dinero ya existente
  (`theme/index.ts` → `palette.income/expense/savings/balance`, documentado en
  `cuadra-design-system`).
- Se muestra centrado en el card cuando `chat.messages.length === 0` (se oculta solo al enviar el
  primer mensaje, por texto o por widget — no hace falta estado extra).
- Tocar un widget llama `chat.send(prompt)` — mismo contrato que `QuickActions` — con haptic ligero
  + sonido `tick-b-crisp.wav` (mismo patrón que enviar por el botón / elegir una opción del dock).
- `t()` (mobile i18n) ganó soporte de interpolación `{token}` (antes no existía) para el saludo
  "¡Qué tal, {name}!" — ver `src/i18n/index.ts`.
- **Marcado con `TODO(chat-home-widgets):`** directamente en `chat-empty-state.tsx` en los 2 puntos
  pendientes (nombre hardcodeado, lista fija en vez de catálogo) — buscar ese tag para ubicarlos.

**Pendiente de ESTA sesión, decisión explícita del usuario**: el nombre del saludo está
**hardcodeado a "Ismael"** (`const name = "Ismael"` en `chat-empty-state.tsx`) — el usuario pidió
usarlo así por ahora. Ver Fase 2 abajo.

---

## 3. Fase 2 — nombre real del usuario (pendiente, pequeña)

- Backend YA expone `GET /v1/identity/me` (`getMe`, `MeResponse.name`) — no hace falta tocar
  backend.
- Falta: un hook mobile `useMe()` (TanStack Query sobre `getMe`) — no existe ningún hook de
  identity en mobile todavía (`features/auth` solo tiene el store de token, sin perfil).
- Reemplazar `const name = "Ismael"` en `chat-empty-state.tsx` por el resultado de ese hook
  (fallback razonable si `getMe` aún no resolvió — quizás el saludo genérico sin nombre, o un
  skeleton).

---

## 4. Fase 3 — catálogo configurable de widgets (pendiente, grande — no iniciada)

**Preguntas abiertas a resolver antes de diseñar:**
- ¿Dónde vive la preferencia "qué 4 widgets elegiste"? Candidato natural: extender
  `aispace.user_preference` (mismo patrón que `personality` y `currency_extra`, ver
  `docs/sdd/currency-preferences.md` para el precedente exacto) con algo como
  `home_widgets: string[]` (array de IDs, orden importa).
- ¿Cuántos widgets tendrá el catálogo TOTAL (más allá de los 4 actuales)? Necesita definirse con
  producto/diseño antes de modelar el catálogo.
- ¿La interacción es "arrastrar" (reorder + pick, tipo home-screen de iOS) o un simple
  multi-select con orden fijo? El usuario mencionó "arrastrarlos" — sugiere reorder real, no solo
  selección.
- ¿El catálogo es una pantalla nueva en Config (mismo patrón que Config → Monedas,
  `currencies-screen.tsx`), o un modo "editar" directamente sobre esta sección del chat?

## 5. Fase 4 — wiring a flows reales (pendiente, grande — no iniciada)

Hoy CUALQUIER widget solo hace `chat.send(promptDeTexto)` — pasa por el mismo NLU/routing que
escribir el mensaje a mano. La visión final es que un widget pueda:
- Saltar directo a un HITL step conocido (bypass del routing), o
- Pre-rellenar campos (p. ej. "Registrar ingreso" ya sabe que `kind="income"`, evitando que el LLM
  tenga que inferirlo del texto).

Requiere decidir un contrato nuevo entre widget → backend (¿sigue siendo un mensaje de texto
"mejorado", o un tipo de evento distinto?) — coordinar con quien lleve el diseño de flows/`aispace`
antes de tocar código.

---

## 6. Dónde continuar

Buscar `TODO(chat-home-widgets):` en el código (`chat-empty-state.tsx`) para los 2 pendientes
marcados inline. Para el catálogo (Fase 3) y el wiring a flows (Fase 4), releer este doc + la
memoria de sesión (`aispace-men`) antes de empezar — son las piezas grandes y ambiguas, conviene
`/sdd-explore` en vez de arrancar directo a código.

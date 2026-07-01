# 💱 Currency Preferences — estado y roadmap

> **Contexto:** `aispace` (preferencias) + `identity` (mercado) + `insights` (wallets/Spaces, pendiente).
> **Estado:** Fase 1 (backend + HITL del flow de gastos + Config mobile) **implementada**.
> Fase 2 (onboarding) y Fase 3 (Spaces/wallets filtrados por moneda) **NO implementadas** — quedan
> documentadas aquí para retomar en otra sesión.
> **Fecha:** 2026-06-30.

---

## 1. Visión completa (lo que pidió el usuario)

El usuario quiere que Cuadra soporte **multi-moneda de punta a punta**, no solo en el registro de
un gasto puntual:

1. En el **onboarding**, el usuario elige su **país** (→ moneda principal) y, si viaja seguido,
   hasta **3 monedas adicionales**.
2. Al registrar un gasto sin decir la moneda, el chat **pregunta cuál** de sus monedas configuradas
   usar (Fase 1 — hecho).
3. Las **wallets/Spaces** que el usuario cree pueden quedar **scoped** a una de sus monedas
   configuradas — el usuario elige en qué Space cae cada transacción de esa moneda.
4. La UI de **Accounts** y **Daily Diary** (home/Insights) debe poder **mostrar/filtrar por 1 de
   las hasta 4 monedas** del usuario, en vez del toggle fijo DOP/USD actual (ver
   `docs/sdd/insights-ui-navbar.md`, y el mock actual `<SegmentedTabs>` DOP/USD en Daily Diary).

Motivación del usuario (textual, resumida): dar a alguien que vive/viaja entre países una
experiencia donde cada Space/wallet puede tener su propia moneda, y las tarjetas de resumen se
pueden filtrar por cuál de sus monedas configuradas están viendo.

---

## 2. Fase 1 — hecho esta sesión (branch `feat/chat-mvp-integration`)

**Backend:**
- La moneda **principal** de un usuario se DERIVA de `identity.user.home_market` (ISO 3166-1,
  YA existente — no fue necesario agregar un campo de país) vía
  `primary_currency_for_market()` (`shared/money`).
- **5 monedas activas**: `DOP, USD, COP, BRL, EUR` (`ACTIVE_CURRENCIES`, `shared/money`) —
  extensible agregando código + entrada al mapa mercado→moneda.
- Hasta **3 monedas extra** por usuario, persistidas en `aispace.user_preference.currency_extra`
  (mismo patrón que `personality`), validadas (máx 3, deben estar activas) en
  `SqlPreferenceRepository` + a nivel Pydantic en el controller.
- `GET/PUT /v1/aispace/preferences/currencies` — expone `{primary, extra, all}`.
- El flow de registro de gasto (`flows/expense/flow.py`) tiene un nuevo primer step
  `currency_pick`: si el usuario no nombró moneda en el mensaje Y tiene más de 1 moneda
  configurada, pregunta (hasta 4 opciones + Cancelar); si no, se salta (comportamiento idéntico
  al de antes).

**Mobile:**
- Config → **Monedas**: pantalla nueva (`features/settings/currencies-screen.tsx`) — la principal
  se muestra fija (no toggleable), las otras 4 monedas activas son checkboxes capados a 3,
  guardado inmediato al tocar (mismo patrón que Personalidad/Idioma).

**Explícitamente NO tocado esta sesión:** onboarding, wallets/Spaces, Accounts, Daily Diary.

---

## 3. Fase 2 — Onboarding (pendiente, no iniciada)

Idea: un flujo de bienvenida (antes de `(tabs)`) donde el usuario:
1. Elige su país → set `identity.user.home_market` (esto YA es parte del alta de usuario hoy,
   revisar `identity/application` para ver dónde se crea el `User` actualmente y si el país se
   pide en algún punto — a investigar).
2. Opcionalmente elige hasta 3 monedas adicionales (mismo picker que Config → Monedas, Fase 1,
   reutilizable tal cual).

**Preguntas abiertas a resolver antes de diseñar:**
- ¿Dónde se crea el `User`/`home_market` hoy (dev-login, OAuth)? ¿El onboarding lo AGREGA o lo
  EDITA post-creación?
- ¿Es un paso obligatorio u opcional/saltable ("elegir después en Config")?
- ¿Aplica solo a usuarios nuevos, o se le muestra una vez a los existentes?

---

## 4. Fase 3 — Spaces/wallets filtrados por moneda (pendiente, no iniciada)

Idea (de los mocks compartidos por el usuario): cada Space/wallet que el usuario cree puede
restringirse a **una** de sus monedas configuradas (de las hasta 4). La UI de:
- **Accounts** (card con Total Income/Bills/Savings/Balance) — hoy es un solo set de 4 tiles;
  pasaría a poder filtrarse por 1 de las monedas del usuario, o mostrar un badge "4" con las
  monedas presentes.
- **Daily Diary** — hoy tiene un `SegmentedTabs` fijo `DOP | USD` (ver
  `docs/sdd/insights-ui-navbar.md`); pasaría a ser dinámico, generado desde `currency_options.all`
  (1 a 4 pills) en vez de hardcodeado a 2.

**Trabajo real involucrado (no trivial):**
- `insights` domain: las `Account`/wallets ya tienen `currency: Currency` (ver
  `insights-ledger.md` §1) — el "scoping a un Space" es probablemente ya soportado a nivel de
  dato (cada wallet YA tiene una única moneda); lo que falta es la UI de filtro/selector y
  probablemente agrupar wallets por Space con su moneda.
- Mobile: `SegmentedTabs` de Daily Diary y los tiles de Accounts, hoy hardcodeados a DOP/USD, deben
  leer dinámicamente `useCurrencyPreferences().all` (el hook YA existe, hecho en Fase 1).
- Definir: ¿un Space tiene UNA moneda fija, o puede tener wallets de varias monedas y el filtro es
  solo de visualización? (el mock muestra "4" como badge — sugiere multi-moneda por Space con
  filtro visual, a confirmar con el usuario antes de diseñar).

---

## 5. Dónde continuar

Al retomar, empezar releyendo este doc + la memoria de sesión (`aispace-men`,
`topic_key: architecture/currency-preferences`) para el detalle de la Fase 1 ya construida, y
luego abrir `/sdd-explore` o una conversación normal para la Fase 2 (onboarding) — es la pieza más
chica y menos ambigua de las dos que faltan.

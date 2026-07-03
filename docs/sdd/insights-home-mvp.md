# 🎡 Insights Home — estado y roadmap (wheel + carrusel de 3 cards)

> **Contexto:** `insights` (mobile UI) + `insights` (backend, ya existente). **Deriva de**
> [`insights-ui-navbar.md`](./insights-ui-navbar.md), el spec de UI aprobado — este doc registra
> qué se construyó de ese spec y qué queda pendiente, no re-deriva el diseño.
> **Estado:** Fase 1 (la rueda + el carrusel de 3 cards + navegación mínima) **implementada**.
> Fase 2+ (las otras 4 pantallas del navbar, los 2 modales, formularios de alta, marcadores de
> categoría reales) **NO implementada** — documentada aquí para retomar en otra sesión.
> **Fecha:** 2026-07-01.

---

## 1. Visión completa

Ver [`insights-ui-navbar.md`](./insights-ui-navbar.md) — el spec completo de la pantalla:
la rueda persistente (presupuesto + tendencia + marcadores de categoría), los 7 botones (5 navbar
+ 2 modales), y el carrusel de 3 cards (Accounts / Spaces / Daily Diary). Este doc solo trackea
el corte de alcance de la implementación mobile.

---

## 2. Fase 1 — hecho esta sesión (branch `feat/chat-ui-polish`)

**La rueda (`insights-wheel.tsx`):** estado vacío (copy + `ScallopFab` central) y poblado (arco
heatmap verde→amarillo→naranja→rojo dibujado con `<Path>` de react-native-svg — NO
`strokeDasharray` sobre un `<Circle>`, porque un arco multi-color necesita matemática de ángulos
de todas formas; ver el comentario en el archivo). Consume `useDailyTarget()` únicamente
(`monthly_limit_minor` → Budget, `spent_month_minor` → Total Expense) — deliberado, ver el
comentario en `api.ts`: evita que Budget y Total Expense puedan desincronizarse si algún día
`useMetrics()` usa una ventana de fecha distinta a "este mes calendario".

**Los 7 botones (`insights-nav-row.tsx`):** los 5 de la fila inferior + los 2 laterales (⊕/☆) se
renderizan con `GlassButton` (promovido a `components/ui/`, ver más abajo). **Solo el botón
central "home carousel" hace algo** — es la única sección que existe todavía. Los otros 6 tienen
`onPress={() => {}}` marcado `TODO(insights-mvp):`.

**El carrusel de 3 cards (`insights-carousel.tsx`):** `Animated.ScrollView` con paginación +
indicador de puntos animado por `scrollX` (mismo patrón `useSharedValue`/`useAnimatedStyle` ya
usado en toda la app — sin `entering`/`exiting`, sin dependencia nueva de
react-native-gesture-handler).
- **Card ① Accounts** (`accounts-card.tsx`) — **totalmente wireada**: 4 tiles (`useMetrics()`) +
  Recent Transactions (`useTransactions(5)`), estado vacío/poblado exacto al Figma.
- **Card ② Spaces** (`spaces-card.tsx`) — **solo estado vacío**, a propósito: el Figma únicamente
  diseñó el estado vacío, y el backend solo tiene CRUD básico (list/create) sin flujo rico
  todavía.
- **Card ③ Daily Diary** (`daily-diary-card.tsx`) — wireada: `useDailyTarget()` para
  Daily Target/You spent today + anillo de progreso, `useAccounts()` para el stack de wallets y
  el balance por moneda **en líneas separadas, nunca sumadas** (regla dura del proyecto, §12·B).

**Infraestructura compartida (nueva, usada por chat E Insights):**
- `src/theme/money-role-colors.ts` — `MONEY_ROLE_COLORS`, los 4 pares de color exactos de Figma
  (income/expense/savings/balance, invertidos por tema). `chat-empty-state.tsx` se refactorizó
  para leer de acá en vez de tener los hex duplicados — es la pieza concreta que hace que el chat
  y los tiles de Insights se vean como el mismo lenguaje visual.
- `src/lib/money.ts` — `formatMoney(minorUnits, currencyCode)`. No existía ANTES de esta sesión
  en todo el mobile — cada figura de dinero de la app pasa por acá ahora.
- `src/components/ui/glass-button.tsx` — **promovido** desde `features/aispace/` (era el primer
  uso cross-feature real: Insights necesita 7 instancias). Cero imports cross-feature existían
  antes en el codebase — moverlo fue la forma correcta, no importar directo entre features.
- `src/lib/hooks/use-currency-preferences.ts` — **promovido** desde `features/settings/api.ts`
  por la misma razón (Config lo escribe, Insights lo lee).
- `src/components/ui/scallop-fab.tsx` — el FAB escalopado/flor (botón "+" central de la rueda,
  reusado también en los headers/empty-states de las 3 cards). Figma exporta esta forma como
  raster aplanado (no expone el path vectorial del boolean-op) — se reconstruyó con N círculos
  del mismo color superpuestos alrededor de un círculo central (técnica estándar de "badge
  escalopado", escala limpio a cualquier tamaño).
- Fuente **Akshar** cargada de verdad (`@expo-google-fonts/akshar` + `expo-font`), gateada en
  `app/_layout.tsx` junto con auth/idioma — las cifras de dinero usan `Akshar_500Medium`/
  `Akshar_600SemiBold` (`src/theme/fonts.ts`), no la fuente del sistema.

**Gap de infra descubierto y arreglado:** ningún componente en mobile había importado una imagen
estática (`require(".png")`) bajo un test antes de esta sesión — un `require()` compilado corre
como `require()` nativo de Node en tiempo de test y **evita completamente** el `resolve.alias` de
Vite (ni siquiera pasa por `vi.mock`). Fix: usar `import` ESM para assets estáticos en vez de
`require()` (Metro soporta ambos), más un alias regex `\.(png|jpe?g)$` → stub en
`vitest.config.ts`, más una declaración ambient `declare module "*.png"` en `src/types/`.
`brand-logo.tsx`/`receipt-attachment.tsx` siguen usando `require()` — no se tocaron (no tienen
test hoy, no era necesario).

---

## 3. Fase 2+ — pendiente (no iniciada)

- **Las otras 4 pantallas del navbar**: 🗂️ Movimientos/Histórico completo, 🥧 Reportes
  (donut por categoría, ingresos vs gastos), $ Presupuestos (por categoría/comercio + umbrales de
  alerta), 🔔 Alertas & Recordatorios. Backend: solo Reportes/Presupuestos tienen algo de
  infraestructura (`application/reports.py`, `application/planning.py`) — Alertas no existe.
- **Los 2 modales**: ⊕ Nueva categoría, ☆ Metas & Net worth (bottom-sheets sobre la rueda).
- **Marcadores de categoría reales** en el arco de la rueda (`markers: CategoryMarker[]`, hoy
  wireado con `[]` — el prop shape ya está listo, falta el pipeline de enrichment que decide qué
  categorías destacar).
- **Formularios de alta** (`+` de Accounts, ⊕ de la rueda, "Agregar espacio" de Spaces, "Agregar
  billeteras" de Daily Diary) — necesitan tratamiento `cuadra-mobile-forms` (react-hook-form +
  zod + `MoneyInput`), fuera de alcance de este pase.
- **Toggle DOP/USD dinámico de Daily Diary** — hoy hardcodeado a esos 2, ya documentado como Fase
  3 pendiente en [`currency-preferences.md`](./currency-preferences.md) §4 (leer
  `useCurrencyPreferences().all` en vez de 2 monedas fijas). No duplicar ese plan acá.
- **Selector de período** (Hoy/Semana/Mes/Trimestre de Daily Diary) — hoy estático, no filtra
  datos.
- **Badge rojo de la tab de Insights** (`cuadra-tab-bar.tsx`) — sigue siendo decorativo, no se
  tocó.

---

## 4. Dónde continuar

Al retomar: releer este doc + [`insights-ui-navbar.md`](./insights-ui-navbar.md) para el spec
completo. La pieza más chica y menos ambigua de las pendientes es probablemente el selector de
período de Daily Diary (una vez que Fase 3 de `currency-preferences.md` esté resuelta, puede
compartir la misma lógica de "ventana de fecha seleccionable" con `useMetrics()`). Las 4 pantallas
del navbar son, en orden de menor a mayor esfuerzo backend: Movimientos (ya tiene el endpoint) →
Reportes (parcial) → Presupuestos (parcial) → Alertas (desde cero).

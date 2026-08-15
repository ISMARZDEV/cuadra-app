---
name: cuadra-mobile
description: >
  Conventions + stack for building Cuadra's Expo (React Native) app: feature-oriented
  structure, NativeWind styling with dark/light brand theme, TanStack Query over the
  generated @cuadra/api-client, zustand auth, and i18n (es/en/pt).
  Trigger: Writing or editing anything under apps/mobile — screens, routes, components,
  api hooks, theme, auth, or wiring the API client.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.1"
---

> **Compose with the official Expo plugin (`expo@claude-plugins-official`) + Expo MCP — don't
> duplicate them.** Generic Expo expertise lives there: NativeWind/Tailwind setup →
> `expo-tailwind-setup`; styling/components/navigation/animations → `building-native-ui`; data
> fetching → `native-data-fetching`; ~70 examples → `expo-examples`. THIS skill + `cuadra-design-system`
> only add what's Cuadra-specific (structure, api-client wiring, dev-login auth, i18n, our look).

> **Research the state of the art FIRST (2025-2026) — a standing priority, not an afterthought.**
> Before building or choosing anything non-trivial (a library, native module, animation/perf
> pattern, architecture, or security-sensitive flow), do NOT code from memory. Investigate and be
> CRITICAL: current official docs (Expo/React Native), high-signal GitHub repos, papers, engineering
> blogs and forums, and **how successful projects with strong architectures solve it** — plus the
> security angle (secure token storage, PII, OWASP MASVS). Compare options with honest trade-offs,
> verify claims (versions, SDK compat, maintenance), prefer the recent + maintained, and flag
> anything unverified as "to verify", never as fact. Grounded decisions over confident guesses — the
> base for working excellently. Use web search / the Expo MCP + docs; don't assume.

## When to Use

- Adding/editing a **screen** or **route** in `apps/mobile`.
- Wiring **data fetching** (TanStack Query + `@cuadra/api-client`).
- Building **UI components** (chat bubbles, inputs, tab bar) or the **theme**.
- Adding **auth** (login, token storage).

## Critical Patterns

**1. Structure — feature-oriented; routes are thin (Obytes/Expo Router 2025).**

| Folder | Holds | Rule |
|---|---|---|
| `app/` | Expo Router **routes only** | A route just re-exports a feature screen: `export { ChatScreen as default } from "@/features/aispace/chat-screen"` |
| `src/features/<f>/` | `<f>-screen.tsx`, `api.ts` (Query hooks), `use-*-store.tsx` (zustand), `components/`, **`enums.ts` · `interfaces.ts` · `types.ts`** | Feature is self-contained |
| `src/components/ui/` | Shared design-system primitives (Button, Input, Bubble…) | Promote here only when used in 2+ features |
| `src/lib/` | Infra: `api/` (client config), `auth/` (token storage), `hooks/` | Cross-cutting |
| `src/i18n/` | Translation files es/en/pt | UI strings localized (same languages as backend) |

- **Absolute imports** `@/...` (alias → `src/`); **no barrel exports** (`index.ts` breaks fast-refresh); relative imports within the same feature.
- **Keep screens lean**: composition + navigation only; sections own their state/Query hooks.
- **Types in DEDICATED files, never inline** (structure §3): `interface` for object/prop shapes,
  `enum` for closed value sets (e.g. `ChatRole`), `type` only for genuine aliases/unions. Per
  feature → `enums.ts` / `interfaces.ts` / `types.ts`; cross-feature → `src/shared/{interfaces,enums,types}`.
  Components import their props from `../interfaces`. (A types-only file is erased at build → NOT a
  barrel, so it's fast-refresh safe.) **Exception:** keep a WIRE/JSON discriminated union as a
  string-literal union (e.g. SSE `{type:"token"}`), not a nominal enum — an enum fights the values
  that arrive off the network.

**2. Styling — NativeWind + react-native-reusables + own components.**
- **NativeWind** (Tailwind for RN) via `className`; dark/light via Tailwind `dark:` + `useColorScheme()`. Brand green `#16A34A`. Tokens in `tailwind.config.js` (see `cuadra-design-system` skill).
- **react-native-reusables** as composable, unstyled bases (shadcn-style); **build our OWN components** on top for Cuadra's look (scalloped FABs, the Insights wheel, card tiles). Don't fight the library — wrap it.
- **Icons: `lucide-react-native`** (lucide.dev) — the ONLY icon set. One `<Icon name=... />` wrapper in `components/ui`.

**2b. Component-driven + refactor (HARD rule).**
- Build the screen from small, named, reusable components — never one giant screen file. If a visual block repeats (card, money tile, list row, chip, FAB), it's a component in `components/ui/` or the feature's `components/`.
- **Refactor relentlessly**: the 2nd time you copy markup, extract it. Screens = composition only. See `cuadra-design-system` for the component inventory.

**3. Data — TanStack Query over `@cuadra/api-client`.**
- Configure the generated client ONCE in `src/lib/api/` (base URL from env + auth header from the token).
- Query/mutation hooks live in `features/<f>/api.ts` and call the SDK functions (`getMetrics`, `chat`, `resume`, `devLogin`). Screens consume the hooks.

**3b. Streaming (SSE) — hand-rolled over `expo/fetch`, NOT the generated SDK.**
- The hey-api SDK can't model a token stream. For SSE endpoints (the chat `POST /aispace/chat/stream`)
  write a transport on **`expo/fetch`** (SDK-56 WinterCG fetch with real `ReadableStream` on native —
  **do NOT add `react-native-sse`**; the native `EventSource` also can't send the `Authorization`
  header). Read base URL + token via `API_BASE_URL` / `getApiAuthToken()` exported from
  `lib/api/client.ts` (the transport bypasses the SDK interceptor, so it sets its own Bearer).
- Parse `data:` frames; surface a small event union (`token`/`pending`/`done`/`error`). A hook
  (`use-chat`) owns state + drives the transport; the screen consumes the hook. (HITL confirm still
  uses the generated `resume`.)

**4. Auth — zustand store + dev-login (no external IdP yet).**
- Login screen calls `devLogin({ body: { email } })` → store `access_token` in a zustand auth store (+ secure storage for persistence) → inject as `Authorization: Bearer` in the api-client config. Root `_layout` gates `(auth)` vs `(tabs)` on token presence.
- Prod swaps dev-login for the external IdP (§E.2). Never hardcode tokens in committed code.

**5. i18n — localize UI strings (es/en/pt), consistent with the backend.**
- App copy in `src/i18n/{es,en,pt}.json`. The CHAT replies come already localized from the agent (backend handles language); the app passes a `locale` to the chat endpoints.
- **Gotcha:** send the app's CHOSEN language (`getLanguage()` from `src/i18n`), NOT the raw device
  locale (`Intl…resolvedOptions().locale`). The backend uses the client locale as the PRIMARY signal
  and only overrides on high-confidence per-message detection — so a Spanish user on an English phone
  got English replies. (See `docs/sdd/aispace-general-agent.md` §4.)
- **Language is a user PREFERENCE, not the device's.** `features/settings/use-language-store.tsx`
  (zustand, persisted via SecureStore) holds `{auto, lang}`: `auto` (default) follows
  `deviceLanguage()`, OFF pins es/en/pt. It calls i18n `setLanguage` (the whole app) and the chat
  reads `getLanguage()`. Selector lives in Config → Idioma (a Switch reveals the picker). Root
  `_layout` calls its `restore()` on mount. **Reactivity caveat:** `t()` reads a module global —
  the screen that changes language re-renders (subscribes to the store) and the chat is correct
  (reads at send), but other static copy updates only on remount/navigation. Acceptable for MVP.
- **Backend splits "workflow chrome" vs. "free reply" language** (`ui_language` vs `language` in
  `AispaceState`) — the HITL dock's confirm/cancel/prompts ALWAYS follow the app's chosen locale
  you send (never overridden by what the user typed that turn), while the agent's own free-text
  reply can still adapt to a clearly-different message language. Mobile doesn't need to do
  anything extra for this (still just send `getLanguage()`) — noted here so it's clear why the
  dock's buttons never "flip" language mid-conversation the way a reply might.

**6. Native / New-Architecture (Fabric) gotchas — learned the hard way.**
- **Reanimated `entering`/layout animations are UNRELIABLE here** (don't fire on the New
  Architecture). For per-element animation (e.g. the chat's per-word fade-in, `streaming-text.tsx`)
  use the primitives that DO work app-wide: `useSharedValue` + `useAnimatedStyle` + `withTiming`,
  kicked off in a `useEffect` on mount. Animate words as wrapping inline `<Animated.View>` (not
  nested inline `<Text>` runs). Only newly-mounted items animate (React reuses earlier ones by key).
- **NEVER wrap a `ScrollView` in `<TouchableWithoutFeedback>`** (a common keyboard-dismiss hack): it
  claims the touch responder on start and STEALS the ScrollView's vertical pan + rubber-band bounce.
  Dismiss the keyboard via the ScrollView itself: `keyboardDismissMode="interactive"` (also gives the
  iMessage drag-down-to-dismiss) + `keyboardShouldPersistTaps="handled"`.
- **ChatGPT-style chat scroll recipe:** `alwaysBounceVertical` + `bounces` + `overScrollMode="always"`
  (elastic bounce even when content fits) · content **top-aligned** (default container; do NOT
  `justifyContent:flex-end` — that's WhatsApp, leaves a gap above) · **smart auto-follow**: track
  near-bottom in `onScroll` and only `scrollToEnd` on new/streaming content when already at the
  bottom, so scrolling up to read history isn't yanked down.
- **Selectable rows (radio/checkbox):** RN-Web does NOT map `accessibilityState={{selected/checked}}`
  → `aria-*` for `role="button"`. Use the unified RN ARIA props directly — `role="radio"` (or
  `"checkbox"` for multi-select) + `aria-checked={selected}` + `aria-label` — which map on BOTH
  native and web (and are testable). Shared `SelectableRow` (`features/settings/components/`)
  powers personality/language (radio) and currency prefs (checkbox, capped selection) — pass
  `role`/`disabled`, don't fork the component.
- **A native `GlassView`/`GlassSurface` must never auto-size to CHANGING content.** If a glass
  surface WRAPS content whose height grows (e.g. a collapsible panel opening), Fabric mis-measures
  on re-layout — the whole zone drifts/detaches from where it should be pinned, even with nothing
  else animating. Fix: make the glass an `absoluteFill` BACKGROUND (only the tint/border live
  inside it) and let a plain sibling `View` in normal RN flow size the container and anchor
  edges — same pattern the chat card and its bottom dock both use.
- **A multiline `TextInput`'s controlled `value` can "resurrect" after you clear it.** On iOS, a
  pending autocorrect/predictive-text candidate can commit on a NATIVE event that fires AFTER your
  send handler already ran `setValue("")` — a synchronous clear (state or `.clear()`) in that same
  handler doesn't reliably win the race, so the old (now autocorrected) text briefly reappears.
  Fix by intercepting the specific late event instead of racing it: remember the (lowercased) text
  you just sent, and in `onChangeText`, if the incoming text matches it case-insensitively, treat
  it as that echo and clear again — any OTHER incoming text clears the guard so real typing right
  after Send is never eaten (`features/aispace/components/chat-input-bar.tsx`).

**7. Sub-screens inside a tab (Config → detail, back via arrow OR the tab).**
- Turn the tab leaf into a NESTED STACK: `app/(tabs)/config/{_layout.tsx (Stack, headerShown:false),
  index.tsx, <detail>.tsx}`. The tab bar stays (it belongs to `(tabs)`), so the detail is reachable
  back via its own arrow (`router.back()`) OR by tapping the Config tab (pops to index). The custom
  tab bar filters routes by `name` so the `config` route still works unchanged.
- **Typed routes** (`experiments.typedRoutes`) live in gitignored `.expo/types/router.d.ts` — adding
  a route makes `router.push("/config/...")` fail `typecheck` until regenerated. Regenerate by briefly
  running Metro (`npx expo start`, wait for the path to appear in the d.ts, kill it); CI regenerates
  on build.
- **Every screen in a nested Stack MUST self-paint `<AppBackground/>`, not rely on the root layer
  showing through.** The root `contentStyle:{backgroundColor:"transparent"}` (so the ONE
  `<AppBackground/>` mounted in `theme-provider.tsx` shows through everywhere) looks fine at rest
  but breaks push/pop: `react-native-screens`' native stack never properly hides a transparent
  OUTGOING screen mid-transition, so its live content visibly ghosts/overlaps under the incoming
  screen (documented, unresolved upstream — expo/expo#33040). Add `<AppBackground/>` as the first
  child inside every new sub-screen's root `SafeAreaView` (see `features/settings/*-screen.tsx` for
  the 4 Config sub-screens that need it) — visually identical at rest, but each screen is now
  self-contained during the slide so nothing bleeds through.

**Promover un componente a `components/ui` — el checklist** (hecho 2026-08-14 con
`basket-product-card`, que pasó del chat a la home de Supermarket):

1. **`git mv`**, no copiar. Un componente duplicado diverge al primer retoque.
2. **El TIPO de sus props/datos se muda CON él.** Un componente de `ui` que importa tipos de una
   feature invierte la dependencia — `ui` no puede saber que existe `aispace`. Mové la `interface`
   al propio componente y dejá un **reexport** en la feature (`export type { X } from "@/components/ui/…"`)
   para no romper a quien ya lo importaba de ahí.
3. **Adaptalo por PROPS CON DEFAULT, nunca con un `mode` nuevo.** Cada pantalla pasa lo suyo
   (`badge`, `discountBps`, `onBookmark`) y quien no las pasa ve exactamente lo de antes. Así el
   consumidor original no cambia ni un pixel y no hay que re-verificarlo entero.
4. **Toda medida que el CONTENEDOR necesita, se EXPORTA.** `CARD_WIDTH` para el `getItemLayout`, y
   `CARD_DISCOUNT_OVERHANG` porque el sello monta sobre el canto y la lista tiene que reservarle ese
   aire. Con el número copiado a mano, tocarlo en el componente rompe al contenedor **en silencio**.
5. **Ojo con lo que el import arrastra.** Importar un hook desde un módulo pesado se lleva TODO ese
   módulo al grafo del consumidor — un hook de geometría que vivía en `cuadra-tab-bar.tsx` arrastraba
   la barra entera y con ella `require()` de PNG que vitest no resuelve, y rompió tests que no
   tenían nada que ver. Un hook que sólo necesita números va en su PROPIO archivo.

**Carruseles horizontales — la sangría va DENTRO del rail, no en el padre.**
Si la pantalla padea su `ScrollView`, la lista horizontal hereda ese margen, termina antes del borde
y la última tarjeta se ve cortada contra un vacío en vez de sangrar fuera de pantalla. El rail se
dibuja a ancho completo y aplica la sangría él mismo: `paddingHorizontal` en el encabezado y en
`contentContainerStyle` de la lista (y el mismo valor en el `offset` del `getItemLayout`). Pasalo
como prop (`gutter`) para que sea un contrato explícito y no algo que alguien "arregla" devolviendo
el padding al contenedor.

**Filas condicionales = tarjetas desalineadas.** Un bloque que aparece sólo en algunas tarjetas
(el precio tachado de una oferta) hace que cada una termine a distinta altura y las barras de acción
queden escalonadas. **Reservá el hueco SIEMPRE** con un alto fijo, aunque esté vacío.

**Estados de una pantalla con datos: `loading` / `error` / `empty` / `content`, y la decisión en una
función PURA aparte.** Es lo único de la pantalla que se puede probar bajo jsdom, y equivocarla se
paga caro: una pantalla en blanco no dice si la red falló, si no hay datos o si sigue cargando —
nos costó media hora de diagnóstico real. Dos reglas que salieron de mutar el test:
- Si **alguna** consulta trae datos → `content`. Media pantalla útil es mejor que una disculpa.
- `error` si falló **CUALQUIERA** (`||`, no `&&`). Con una caída y la otra devolviendo cero, decir
  «no hay productos» es MENTIR: no lo sabemos, parte del dato no cargó. Sólo se afirma vacío cuando
  se pudo mirar el catálogo entero.

## Code Examples

```tsx
// app/(tabs)/aispace.tsx — route is a thin re-export
export { ChatScreen as default } from "@/features/aispace/chat-screen";

// src/features/aispace/api.ts — Query/mutation over the SDK
import { useMutation } from "@tanstack/react-query";
import { chat } from "@cuadra/api-client";
export const useSendMessage = () =>
  useMutation({ mutationFn: (vars: { message: string; thread_id?: string; locale?: string }) =>
    chat({ body: vars }).then(r => r.data!) });
```

## Commands

```bash
make openapi                          # regenerate @cuadra/api-client after backend changes
pnpm --filter @cuadra/mobile typecheck   # tsc --noEmit (run after edits — cannot run simulator headlessly)
pnpm --filter @cuadra/mobile start       # expo start (the USER runs this to see the app)

# ⚠️ Metro DEBE arrancar desde apps/mobile. Desde la raíz del repo falla con
#    "Unable to resolve module ../../App from node_modules/expo/AppEntry.js".
pnpm --filter @cuadra/mobile exec expo start --dev-client --port 8087 --clear

# ⚠️ `EXPO_PUBLIC_*` se HORNEA en el bundle al transformar: cambiar `.env` NO basta,
#    hay que REINICIAR Metro (con --clear). Recargar la app no sirve.
# ⚠️ Para un DISPOSITIVO FÍSICO usá ./scripts/dev-up.sh (inyecta la IP de la LAN):
#    con `localhost` el teléfono se apunta a sí mismo y toda llamada al backend falla.
```

> El agente PUEDE verificar el móvil solo (deep links + `simctl io screenshot` + `sips` para
> ampliar): las recetas están en la skill **`cuadra-ui-verify`**, sección «Mobile».

## Resources

- **Design language**: load the `cuadra-design-system` skill (theme, components, screen patterns).
- **Generated SDK**: `packages/api-client/src/generated` (functions: getMe, devLogin, chat, resume, getMetrics…).
- **Auth unblock (dev)**: `POST /v1/identity/dev-login` (backend, dev-only).
- **Stack**: Expo Router · NativeWind · react-native-reusables · lucide-react-native (icons) · TanStack Query · zustand.
- **Design refs (Mobbin)**: Duolingo (gamification) · Uber Eats / Walmart (Save marketplace).

## Listas: aparición al scroll y ocultar cromo (2026-08-15)

### `entering` de Reanimated es una TRAMPA dentro de `FlatList`

Parece la herramienta obvia para «que las tarjetas aparezcan» y no lo es. Tres razones, dos medidas
y una documentada aquí mismo:

1. **`FlatList` DESMONTA las filas lejanas y las remonta al volver** → con `entering`, cada
   elemento se re-anima cada vez que reaparece. Un parpadeo perpetuo, no un efecto.
2. Con `numColumns > 1` los retardos por ítem funcionan en iOS y **disparan todo a la vez en
   Android** (bug abierto de la librería).
3. `streaming-text.tsx` ya dejó anotado que `entering` **no dispara de forma fiable** en la New
   Architecture de este proyecto.

**En su lugar: efecto LIGADO AL SCROLL**, es decir una FUNCIÓN PURA de la posición. Reciclar una
fila no reinicia nada porque no hay nada que reiniciar — se recalcula. Sólo se animan `opacity` y
`transform`, las dos únicas propiedades que no obligan a recalcular layout.

```tsx
const entered = scrollY.value + viewportH.value - rowTop;   // rowTop = contentTop + fila * altoFila
const p = interpolate(entered, [0, altoFila * REVEAL_ROWS], [0, 1], Extrapolation.CLAMP);
const eased = 1 - (1 - p) ** 3;                              // entra rápido, ASIENTA despacio
```

- **`REVEAL_ROWS` se deriva del alto de fila, no es un número de píxeles.** El número *es* cuántas
  filas están en vuelo a la vez: por debajo de 1 sólo anima la que entra y se ve «de una en una, a
  saltos»; a 3.5 se mueven la última, la penúltima y la antepenúltima → una OLA continua, y cada una
  más despacio (así que subirlo también SUAVIZA, no sólo alarga).
- **La opacidad termina antes que el movimiento** (~45% del recorrido): el contenido se lee mientras
  todavía se asienta, en vez de pasar media entrada en penumbra.
- **Respetar «Reducir movimiento»** (`AccessibilityInfo.isReduceMotionEnabled` + el listener
  `reduceMotionChanged`). Una rejilla que sube y se acerca es exactamente lo que esa preferencia
  existe para evitar.
- Ver la regla del **estado por defecto VISIBLE** en `cuadra-ui-verify`.

### `onLayout` de una `FlatList` MIENTE

Reporta medidas intermedias (medido: **76px** para un viewport de 874) y pisa el buen valor. Toda
fila salía con progreso 0 → **pantalla en blanco** hasta tocar.

- Inicializar el alto de viewport con el de la **ventana** (`useWindowDimensions`), que es buena
  aproximación desde el frame uno.
- Refinarlo **sólo** con `e.layoutMeasurement.height` del evento de scroll, y **sólo si es
  plausible** (`> 200`). Nunca empeorar una aproximación buena.

### Ocultar el navbar al desplazarse: cuatro guardas

Con menos, la barra «no sabe qué hacer» — se esconde y reaparece sola. Todas hacen falta:

1. **¿COMPENSA?** No basta con «se puede scrollear»: sólo si queda **≥1 pantalla** por recorrer
   (proporción del viewport, no píxeles). Con 2-3 filas se escondía y volvía un segundo después.
2. **Sólo mientras el DEDO ARRASTRA** (`onBeginDrag`/`onEndDrag`). La inercia y el asentamiento
   también emiten eventos, y al final de la lista generan deltas en los dos sentidos → oscilación.
   Esconder navegación responde a una INTENCIÓN; el impulso es física.
3. **El REBOTE no es recorrido.** Fuera de `[0, maxY]` congelar el estado.
4. **HISTÉRESIS**: acumular ~28pt en la misma dirección antes de conmutar. Con el delta de un solo
   frame, el temblor del dedo hace parpadear el header.

Y **una sola constante de tiempo** (`NAV_HIDE_MS` en `cuadra-tab-bar`) para los tres disparadores
—drawer del chat, chat expandido, scroll de una rejilla—: si cada uno pone el suyo, el mismo gesto
se siente distinto según de dónde venga. A 240ms el desvanecido se comía la bajada y la barra
parecía *esfumarse* en vez de *irse*; a 300 se lee el recorrido.

## La URL de la API se DEDUCE en desarrollo

`EXPO_PUBLIC_API_URL` se **hornea en el bundle** y la IP LAN del Mac la cambia el DHCP: lo que era
bueno al arrancar Metro caduca sin avisar, y el síntoma («no pudimos cargar») parece un bug de
código. `src/lib/api/base-url.ts` deduce el host de **quien sirve el bundle**
(`Constants.expoConfig.hostUri`) — esa máquina es, por definición, alcanzable desde el dispositivo.

- **Ni el host ni el PUERTO del `.env` participan**: el puerto es invariante del repo (8005). Un
  `.env` con `localhost:3000` costó media sesión.
- Una URL **remota** puesta a propósito (staging, túnel) se respeta: sólo se deduce cuando el
  objetivo configurado es local o de rango privado.

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
  version: "1.0"
---

> **Compose with the official Expo plugin (`expo@claude-plugins-official`) + Expo MCP — don't
> duplicate them.** Generic Expo expertise lives there: NativeWind/Tailwind setup →
> `expo-tailwind-setup`; styling/components/navigation/animations → `building-native-ui`; data
> fetching → `native-data-fetching`; ~70 examples → `expo-examples`. THIS skill + `cuadra-design-system`
> only add what's Cuadra-specific (structure, api-client wiring, dev-login auth, i18n, our look).

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
| `src/features/<f>/` | `<f>-screen.tsx`, `api.ts` (Query hooks), `use-*-store.tsx` (zustand), `components/` | Feature is self-contained |
| `src/components/ui/` | Shared design-system primitives (Button, Input, Bubble…) | Promote here only when used in 2+ features |
| `src/lib/` | Infra: `api/` (client config), `auth/` (token storage), `hooks/` | Cross-cutting |
| `src/i18n/` | Translation files es/en/pt | UI strings localized (same languages as backend) |

- **Absolute imports** `@/...` (alias → `src/`); **no barrel exports** (`index.ts` breaks fast-refresh); relative imports within the same feature.
- **Keep screens lean**: composition + navigation only; sections own their state/Query hooks.

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

**4. Auth — zustand store + dev-login (no external IdP yet).**
- Login screen calls `devLogin({ body: { email } })` → store `access_token` in a zustand auth store (+ secure storage for persistence) → inject as `Authorization: Bearer` in the api-client config. Root `_layout` gates `(auth)` vs `(tabs)` on token presence.
- Prod swaps dev-login for the external IdP (§E.2). Never hardcode tokens in committed code.

**5. i18n — localize UI strings (es/en/pt), consistent with the backend.**
- App copy in `src/i18n/{es,en,pt}.json`. The CHAT replies come already localized from the agent (backend handles language); the app passes the device `locale` to `POST /chat`.

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
```

## Resources

- **Design language**: load the `cuadra-design-system` skill (theme, components, screen patterns).
- **Generated SDK**: `packages/api-client/src/generated` (functions: getMe, devLogin, chat, resume, getMetrics…).
- **Auth unblock (dev)**: `POST /v1/identity/dev-login` (backend, dev-only).
- **Stack**: Expo Router · NativeWind · react-native-reusables · lucide-react-native (icons) · TanStack Query · zustand.
- **Design refs (Mobbin)**: Duolingo (gamification) · Uber Eats / Walmart (Save marketplace).

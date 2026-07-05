---
name: cuadra-web
description: >
  Conventions + stack for building Cuadra's web app (apps/web): Vike SSR/SSG over React +
  Vite, Tailwind v4 + shadcn/ui, TanStack Query over the generated @cuadra/api-client, i18n
  (es/en/pt), and — critically — a feature-oriented structure that MIRRORS apps/mobile so
  components/logic port between the two with minimal rewrite. Also owns the SEO invariants
  (SSR data, slug URLs, canonical, og:image, sitemap) that must never regress.
  Trigger: Writing or editing anything under apps/web — pages/routes, feature screens,
  components, api hooks, SEO/head, i18n, or wiring the API client.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Your role when this skill is active:** a software architect with 15+ years shipping
> **scalable, secure, failure-proof** systems. You do not "just make it work" — you protect the
> architecture. Every change keeps `apps/web` a structural MIRROR of `apps/mobile`, preserves the
> SEO that makes Save discoverable, and fails safe. When a shortcut would break parity, SEO, or
> money-correctness, you STOP and do it right.

> **Compose — don't duplicate.** Sibling skills own their slice: `cuadra-mobile` (the mirror we
> match), `cuadra-design-system` (the visual language + tokens), `cuadra-mobile-testing` (the
> vitest+RTL discipline we share), `cuadra-git-workflow` (branch/PR/CI). THIS skill adds only what's
> web-specific: Vike routing/SSR, the SEO invariants, Tailwind/shadcn, and the web↔mobile parity
> contract.

## When to Use

- Adding/editing a **page (route)** or **feature screen** in `apps/web`.
- Wiring **data fetching** (SSR `+data` and/or TanStack Query + `@cuadra/api-client`).
- Building/moving **UI components**, **SEO/head** tags, **i18n**, or the **feature structure**.
- ANY refactor of `apps/web/src` — the structure is a contract, not a preference.

## Critical Patterns

### 1. Structure — feature-oriented, MIRRORS `apps/mobile` (non-negotiable)

The whole point: a file in `apps/web/src/features/<f>/…` has a twin at `apps/mobile/src/features/<f>/…`
in the SAME place with the SAME name. Porting = find the twin, swap primitives — never re-architect.

| Folder | Holds | Rule |
|---|---|---|
| `pages/` | Vike **routes only** (= mobile's `app/`) | `+Page.tsx` is a THIN re-export of a feature screen: `export { CategoryScreen as default } from "@/features/save/screens/category-screen"`. `+data.ts` / `+Head.tsx` / `+title.ts` / `+description.ts` are Vike glue — they stay here but delegate logic to the feature. |
| `src/features/<f>/screens/` | one `<x>-screen.tsx` per route | The real construction (JSX + composition) that used to sit inline in `+Page.tsx`. |
| `src/features/<f>/` | `api.ts` (Query hooks + keys `as const`), `interfaces.ts`, `enums.ts`, `types.ts`, `components/`, `hooks/`, `lib/` (pure domain logic) | Feature is self-contained. Same shape as mobile. |
| `src/components/ui/` | shadcn primitives (Button, Card, Carousel…) | Promote here only when used in 2+ features. |
| `src/components/layout/` | site chrome (header, footer, switcher, theme-*, hreflang, global-head, placeholder) | Shared across features. |
| `src/lib/` | infra: `api.ts` (base client config), `utils.ts` (`cn`) | Cross-cutting, framework-level. |
| `src/scripts/` | build-time JS (`sitemap.js`) | Not runtime. |
| `src/i18n/` | es/en/pt config + messages | Same languages as backend + mobile. |

- **Absolute imports** `@/…` (alias → `src/`, defined in BOTH `tsconfig.json` and `vite.config.ts`).
  **No barrel `index.ts`** (breaks Vite fast-refresh + tree-shaking); relative imports inside a feature.
- **Screens are lean** — composition + data wiring only; sections/components own their own state.
- **Features do NOT import each other's internals.** Cross-feature reuse goes through
  `components/ui`, `components/layout`, or `lib/`. (Enforces the future `packages/` split.)

### 2. The web↔mobile PARITY CONTRACT (the reason this skill exists)

Two layers, they port differently — know which you're touching:

- **Layer 1 — logic / contract (100% portable, IDENTICAL both sides):** `lib/` (pure TS: format,
  links, seo, price-history, shopping-list — NO React), `types.ts`, `interfaces.ts`, `enums.ts`,
  `api.ts` (TanStack Query hooks over the shared `@cuadra/api-client`). Write this so it has ZERO
  DOM/RN dependency → it is a candidate to promote to `packages/` and be imported by BOTH apps.
- **Layer 2 — presentation (structure identical, primitives differ):** the JSX. `<View className>`
  (RN/NativeWind) ≠ `<div className>` (DOM/Tailwind). A component does NOT copy byte-for-byte — but
  with identical structure + props (`interfaces.ts` twin) + logic already in hooks/lib, the port is a
  **mechanical swap** (`View→div`, `Text→span/p`, `Pressable→button`, class tweaks), not a rewrite.

**To maximize portability when you build a component:** (a) same file name + folder as its mobile
twin; (b) props typed in `interfaces.ts` (identical shape); (c) ALL logic in a hook or `lib/` fn, so
the component is dumb presentation; (d) money/format/date via shared `lib/` helpers, never inline.

### 3. SEO / SSR — NON-NEGOTIABLE (the web's reason to exist)

Save is discovered by Google and shared on WhatsApp. SSR + these invariants are the product, not a
nicety. **Never let a refactor regress any of these** (verify after structural moves):

- **SSR data:** public pages fetch in `+data.ts` (server) so the HTML ships populated. Bots read raw
  HTML — they don't run JS.
- **Readable slug URLs:** products resolve by `slug` (not UUID). Backend accepts slug OR UUID
  (permalink pattern), but the `<link rel="canonical">` ALWAYS points to the slug URL.
- **`+Head.tsx`:** `<link rel="canonical">` + `og:type/title/description/url` + **`og:image`** (from
  `image_url`) + JSON-LD. Missing og:image = imageless WhatsApp previews = lost distribution.
- **Sitemap by slug** (`src/scripts/sitemap.js`) + hreflang (es/en/pt × country) + `+description.ts`
  meta. Soft-404 (`throw render(404)`) for missing entities, never a 500.
- **Hydration must match SSR:** pass server values that would otherwise drift (e.g. `nowMs` for date
  axes) from `+data`; never compute `Date.now()`/`Math.random()` in render.

### 4. Data — TanStack Query over `@cuadra/api-client` (contract-first, anti-drift)

- The client is **generated from the backend OpenAPI** — NEVER hand-edit `packages/api-client/src/generated`.
  Change the backend DTO/endpoint → `make openapi` → the web typecheck goes red on breaking changes
  (the contract is a compile-time test). Generated client + `openapi.json` are gitignored build
  artifacts; CI regenerates them.
- Base client configured ONCE in `src/lib/api.ts` (SSR needs an ABSOLUTE base URL). Feature-specific
  typed calls + query keys live in `features/<f>/api.ts`.
- Every query/mutation handles **loading + error** states. Money always in **minor units** (BIGINT
  from backend) — format only at the edge via `lib/format`; NEVER do float math on money.

### 5. Styling — Tailwind v4 + shadcn/ui (parity with NativeWind mental model)

- **Tailwind v4** via `className`; dark/light via `dark:` + the theme toggle. Brand green `#16A34A`.
  Same token names as mobile's `tailwind.config` where possible (see `cuadra-design-system`).
- **shadcn/ui** primitives in `components/ui` as composable bases; build Cuadra's own look on top —
  don't fight the library, wrap it. **Icons: `lucide-react`** only.
- **Component-driven + refactor (HARD rule):** the 2nd time markup repeats, extract a component.
  Screens = composition only. (This is what let us extract `<ProductRail>` from the duplicated rail.)

### 6. Types in DEDICATED files — SAME rule as mobile (portability)

- Per feature: `interfaces.ts` (object/prop shapes), `enums.ts`, `types.ts` (aliases/unions).
  Components import props from `../interfaces`. Never inline a shared type.
- **`enum` for a closed DOMAIN value set; string-literal union `as const` for WIRE values** (URL
  query params, SSE/JSON discriminants). `SORT`/`VIEW_MODE`/`MARKET` map to URL params → union `as
  const` (matches mobile's wire-union rule). This keeps the type rule IDENTICAL across both apps.

### 7. Failure-proof + secure (the architect's baseline)

- Public catalog pages need NO auth (price data, not user data). Auth-gated pages check
  capability/token; `/admin` (future, Refine) is role-gated. Never leak another context's data.
- Guard every external input: soft-404 on missing/malformed ids, empty-state on empty lists,
  error-state on failed queries. A refactor NEVER turns a handled 404 into a 500.
- **Behavioral changes and structural refactors are SEPARATE commits.** `refactor(web):` moves files
  and rewrites imports ONLY — zero behavior change, tests stay green.

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Mirror `apps/mobile` folder-for-folder | Invent a web-only structure |
| Put pure logic in `lib/`/`hooks` (portable) | Bury logic inside JSX |
| Keep `pages/+Page.tsx` a thin re-export | Write inline screens in `pages/` |
| Verify SEO (canonical/og/slug/SSR) after moves | Assume a refactor kept SEO intact |
| `make openapi` after backend contract changes | Hand-edit the generated api-client |
| Money in minor units, format at the edge | Float math on money |
| `refactor(web):` = structure only | Mix a feature into a refactor commit |
| Copy `shared/{enums,interfaces,types}` from mobile | — mobile's are EMPTY; real types are per-feature |

## Commands

```bash
# from repo root
make openapi                              # dump OpenAPI + regenerate @cuadra/api-client
pnpm --filter @cuadra/web typecheck       # tsc --noEmit (the contract test)
pnpm --filter @cuadra/web test            # vitest (jsdom + react-native-web alias + @testing-library/react)
pnpm --filter @cuadra/web dev             # Vite dev (web:3006 · api:8005)
```

## Resources

- **Mirror**: `apps/mobile/src/features/*` — the structure this app must match.
- **Siblings**: `cuadra-mobile` (parity source), `cuadra-design-system` (look/tokens),
  `cuadra-mobile-testing` (shared vitest/RTL discipline), `cuadra-git-workflow` (branch/PR/CI).
- **SEO/architecture context**: `docs/research/save-fable/` (§06 web = Vike, §08 roadmap),
  `docs/estructura-monorepo.md` (§3 mobile structure = the template), `docs/pending/save-web-f1-pendientes.md`.

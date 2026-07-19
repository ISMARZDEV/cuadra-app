---
name: cuadra-save-admin
description: >
  The BUILT admin console for Save — the first module of Cuadra's OFV (One Front View, the single
  internal back-office): the matching **review queue** + the **ingestion ops** around it (providers,
  extraction sources with a dry-run probe, the curated basket, source health). Full-stack, F2·B1,
  code-complete. Owns the architecture (backend ingestion_router gated by capability + hexagonal
  use-cases; web feature-resources on a Vike admin shell) AND the hard-won gotchas: Vike guards do
  NOT compose (one +guard.ts per admin route), ClerkProvider mounts EXACTLY ONCE in pages/+Wrapper.tsx
  (a provider in a layout = double-mount crash), admin uses +Layout.clear.tsx to shed the marketing
  chrome, the SSR gate reads the __session cookie (dev-login mirrors its token there so /admin works
  locally, fixed 10.B-D), every admin mutation is AUDITED at the controller edge (T2), admin i18n
  (es/en/pt) is derived from the authenticated user's locale, source health is DERIVED (manual-pause +
  freshness, no auto-detection), and TestSource is an SSRF-guarded dry-run that never persists.
  Composes with cuadra-save (domain) + cuadra-save-matching (the queue's producer) + cuadra-web
  (shell/SSR) + cuadra-api (backend) + cuadra-clerk (auth). Trigger: building, extending, or
  debugging ANY part of the Save admin console / OFV — a new admin resource or screen, the
  providers/sources/basket/health features, the review-queue UI, the admin gate/guards, the
  ingestion_router endpoints, or anything under apps/web/src/features/admin or apps/api admin_save.py.
---

> **Role when active:** a full-stack architect who treats an internal admin console as a
> production system — because a bad human approval here corrupts the whole price catalog downstream
> (SACRED, see cuadra-save-matching). Gate server-side, never fake a signal, keep the shell
> extensible. Strict TDD (RED→GREEN).

> **Compose — don't duplicate.** cuadra-save = Save domain + the 4 SACRED rules. cuadra-save-matching
> = the cascade that FILLS the review queue (the queue + `resolve_review` live there). cuadra-web =
> Vike/SSR/parity/SEO. cuadra-api = hexagonal/TDD/Alembic. cuadra-clerk = the IdP + the dual-mode
> auth. THIS skill owns the admin CONSOLE built on top of all of them (F2·B1).

## What it is (the OFV)

The single internal back-office. B1 ships the **Save** module only; future modules (News, RBAC,
financials) are additive on the SAME shell — register an `AdminResource`, it appears in the nav.
THREE capability domains gate it: `ADMIN_SAVE_MATCHING_REVIEW` (the review queue),
`ADMIN_SAVE_INGESTION_OPS` (providers/sources/basket/health/metrics) and — since F4 —
`ADMIN_SAVE_ORCHESTRATION_OPS` (the orchestration console: launch/cancel/retry/schedule runs). The
third is its OWN capability and not a reuse of the second on purpose: operating runs is more
sensitive than editing a provider, and **Dagster OSS has no authentication of its own**, so that
gate is the only real access control over pipeline execution. The orchestration module has its own
skill: **`cuadra-save-orchestration`**.

**The operating cycle it covers:** Sources (where to extract) + Basket (what to ingest) → ingestion
→ matching cascade (cuadra-save-matching) → 70% auto-linked / 30% uncertain → **Review queue** (human
decides) → clean canonical catalog. Providers + health give visibility over the whole.

## Where it lives

| Layer | Path |
|---|---|
| Backend controller (thin, ALL routes gated) | `apps/api/src/api/v1/controllers/admin_save.py` — `router` (matching-review) + `ingestion_router` (ingestion-ops) |
| Backend use-cases | `contexts/save/application/{resolve_review,create_canonical_and_link,list_review_queue,get_review_detail,bulk_resolve_review,providers,store_registry,basket_query,test_source}.py` |
| Backend entities/ports | `contexts/save/domain/entities/{provider,store_registry,basket_query}.py` · `domain/source_health.py` (pure derive) · `domain/ports/repositories.py` |
| Backend infra | `contexts/save/infrastructure/{repositories,mappers,models}.py` · `catalog_sources/{factory,ssrf_guard}.py` |
| Capabilities + gate | `contexts/identity/domain/enums.py` (CapabilityKey) · `api/extensions/security.py` (`require_capability`) |
| Migrations | `migrations/versions/09526c5ccaca_*` (data-shape) · `0990d45c068a_*` (basket backfill, 213 rows) |
| Web shell | `apps/web/src/features/admin/shell/{admin-resource.ts,AdminLayout.tsx,require-admin.ts,use-admin-list.ts}` |
| Web resources | `apps/web/src/features/admin/resources/{save-matching,save-providers,save-sources,save-basket}/` |
| Web routes | `apps/web/pages/admin/{+Wrapper is at pages/+Wrapper.tsx, +Layout.clear.tsx, +guard.ts, +data.ts, <resource>/{+Page.tsx,+data.ts,+guard.ts}}` |

## Critical Patterns (the gotchas — do NOT relearn the hard way)

1. **ClerkProvider mounts EXACTLY ONCE — in `pages/+Wrapper.tsx`.** A provider inside a layout
   double-mounts, because in vike-react **Layouts NEST, they do NOT replace**. Two `<ClerkShell>`
   (LayoutDefault + admin +Layout) crashed `/admin/*` to a blank page ("multiple <ClerkProvider>").
   NEVER put a context provider in a `+Layout`/`LayoutDefault`; hoist it to the root `+Wrapper`.
2. **Vike guards do NOT compose** — only the most-specific `+guard.ts` runs per route. So EVERY admin
   route subtree needs its OWN `pages/admin/<resource>/+guard.ts` re-checking its capability
   (`hasAdminCapability(pageContext.headers, "<cap>")` → `throw render(403)`). Copy an existing one.
   The parent `pages/admin/+guard.ts` is only the ENTRY gate — since 10.D it checks
   `hasAnyAdminCapability(headers)` (any admin cap, order-independent), NOT `ADMIN_RESOURCES[0]` (the
   old fragile version that worked only because review-queue was first). All FOUR resources
   (review-queue/providers/sources/basket) have their own `+guard.ts` now.
3. **Admin sheds the marketing chrome via `+Layout.clear.tsx`.** The `.clear` suffix resets the
   inherited config chain so `/admin/*` does NOT get LayoutDefault's SiteHeader/SiteFooter. The
   `Wrapper` is a SEPARATE config, unaffected by `.clear` — so ClerkProvider still applies.
4. **The SSR gate reads the `__session` cookie** (or Authorization header) server-side → calls
   `/identity/me`. **Local dev-login now WORKS on `/admin/*` (fixed 10.B-D):** `syncSessionCookie`
   (`use-auth.ts`) mirrors the dev-login token into the `__session` cookie so SSR sees it (only in
   dev-login mode; in Clerk mode Clerk owns `__session`), and `POST /identity/dev-login {email,
   role:"super_admin"}` grants admin access + re-seeds identity idempotently (no more 500 on a fresh
   DB). To view the admin locally: dev-login with `role:"super_admin"`. VERIFIED live: `/admin/*` is
   403 without the cookie, 200 (rendered) with it. (Clerk mode still works too — Clerk sets the cookie.)
5. **`seed_identity` seeds the capabilities/roles (idempotent, `on_conflict_do_nothing`).** A DB
   seeded before B1 was MISSING `admin_save_*` rows → super_admin got 403. Since 10.C, `POST
   /identity/dev-login` CALLS `seed_identity` itself, so a dev-login now self-heals the reference
   data. For real users, grant the role via `dev-login {role:"super_admin"}` (dev) or INSERT into
   `identity.user_role`.
6. **Source health is DERIVED at read-time, not stored/detected.** `derive_source_health(paused,
   max_last_seen_at, now)` → `paused | stale | ok` from TWO real signals only: manual pause
   (`paused_at`) + freshness (`store_product.last_seen_at`). NO schema-break/error-rate/auto-pause —
   that hook doesn't exist in the pipeline (checkpoint 3.17); do NOT fake it.
7. **TestSource is a dry-run: SSRF-guarded, ZERO persistence.** `ssrf_guard.py`: https-only,
   pre-connect `getaddrinfo` rejecting loopback/private/link-local/CGN (via `not is_global`),
   `follow_redirects=False`, size/timeout caps. It NEVER calls a repo. The route returns 200
   (sample) / 422 (config or SSRF-blocked) / 502 (upstream failed) — the web MUST distinguish them.
   Residual DNS-rebinding TOCTOU is documented, not closed (admin-only, low-volume).
8. **i18n in the admin is REQUIRED and BUILT (es/en/pt).** `/admin/*` is EXEMPT from the
   `/{locale}/{country}/` URL prefix, so `usePageI18n()` (URL-sourced) does NOT work — the locale is
   derived from the AUTHENTICATED USER (`MeResponse.locale` → `AdminShellData.locale`, threaded
   through `pages/admin/+data.ts`). The PATTERN (follow it for any new admin screen): the screen
   reads `const { locale = DEFAULT_LOCALE } = useData<XData & { locale?: Locale }>()`, calls
   `const { t } = useAdminI18n(locale)`, and passes `t`/`locale` down to sub-components by prop.
   Strings live in `src/i18n/messages.ts` — add the key to the `MessageKey` union AND all three
   locale blocks (the `Record<Locale, Record<MessageKey, string>>` type makes a missing translation a
   TYPE ERROR). Interpolate (`{name}`, `{count}`) with `format(locale, key, params)`, never string
   concat. Module-level label maps (`AUTH_LABEL`, `HEALTH_LABEL`) become `*_KEY: Record<…, MessageKey>`
   + `t()`. DONE: review-queue, basket, providers, sources. Verify with cuadra-ui-verify (switch
   es→en→pt on the real SSR render). **The topbar `LanguageSwitcher`** lets the operator change the
   admin language: it writes an `admin_locale` cookie (SSR-readable) and reloads; `pages/admin/+data.ts`
   reads it via `extractAdminLocale(headers)` and PRIORITIZES it over `MeResponse.locale` — so the
   switch is admin-scoped (does NOT mutate the user's global `locale` / mobile / agent). Priority:
   cookie → user locale → default.
9. **Web data: SSR `+data.ts` for lists, `authHeaders()` for mutations.** NO TanStack Query. After a
   mutation, refresh via `use-admin-list.ts` (`useAdminList(initial, fetcher)` — seeded from the SSR
   prop, re-fetches into local state) — NOT `window.location.reload()`.
10. **`product_match` is the single source of truth for a link** (cuadra-save-matching): `ResolveReview`
    writes `store_product.canonical_product_id` + the match status in ONE transaction. Reject REQUIRES
    a `reason_code`. Never bypass the use-case.
11. **Coloring a Lucide icon per-item inside a `DropdownMenuItem` needs `**`, not `[&_svg]`.** Lucide
    icons stroke with `currentColor`, so the paint color is the **`<path>`'s** `color`, not the
    `<svg>`'s. The base `DropdownMenuItem` greys ALL descendants on focus via
    `not-data-[variant=destructive]:focus:**:text-accent-foreground` — which hits the `<path>`. An
    override with `focus:[&_svg]:text-x` only recolors the `<svg>` wrapper → the path stays grey
    (only the `destructive` variant escapes, because it's excluded from that rule — that's why
    "Eliminar" worked but Ver/Editar/Compartir didn't). Fix: same variant signature as the base,
    `not-data-[variant=destructive]:focus:**:text-<color>` (tailwind-merge keeps yours, it comes
    later). Also: **Tailwind v4 important is a SUFFIX** (`text-x!`), not the v3 prefix (`!text-x`) —
    the prefix silently no-ops. Verify icon color via `getComputedStyle(path).stroke`, never by eye on
    a small PNG (see cuadra-ui-verify). Ref: `ReviewRow.tsx` actions menu.
12. **Sources (`save-sources`) = table/cards mirror of the curated basket + a TYPED-auth modal.** The old
    raw form was redesigned (`SourcesScreen` mirrors `BasketEditorScreen`): search-pill, bulk Actions, Add
    provider, pagination, sortable headers, **grid/list toggle** (the `VIEW_CHIP_*` chips from
    `ReviewQueueToolbar`), a LIST view with its own **Logo column** + a CARDS view. `SourceModal` (add/edit)
    uses **typed auth** (none/bearer/api_key/basic → conditional fields) + **Probar**; the Provider field is
    a **per-country select-search** (`listProviders({market})` + `FilterSearchSelect` with logo). Backend:
    `SourceHealthDto` now returns the config with **MASKED `auth`** (`mask_auth`) + `provider_name`/
    `logo_url` (`ListSourcesHealth` injects `ProviderRepository`) — for the edit-modal prefill and the cards.
    The auth model/plumbing (Authenticated Sources §15) lives in **`cuadra-save` §8**. Secret gotchas:
    **write-only** — on edit the field arrives `••••…`; if UNCHANGED the frontend sends `auth: null` and
    `UpdateSource` keeps the existing one; the token goes in the **value** field, not the header name.
    `SourceLogo`: backend `logo_url` → bundled logo by name (`features/save/lib/provider-logos.ts`) →
    initial placeholder.
13. **Admin mutations are AUDITED at the CONTROLLER edge (T2), not in the use-case.** Every sensitive
    mutation writes one append-only row to `save.admin_audit_log` (`actor_user_id, action, target_type,
    target_id, payload_summary jsonb, market_id, created_at`) in the SAME request transaction. The
    handler takes `audit: AdminAuditRecorder = Depends(get_admin_audit)` and calls
    `audit.record(action, target_type, target_id, payload)` AFTER the mutation succeeds. Why the edge,
    not the use-case: "who did this HTTP action" is a cross-cutting concern (actor = the request);
    atomic anyway because `get_session` is a per-request UoW (commits at the end). **When you add a new
    admin mutation, audit it** — copy an existing handler. **NEVER log a secret**: source `auth` goes
    through `mask_auth` before it enters the payload. Wiring is split to avoid an import cycle:
    `composition_root.get_admin_audit_repo` gives the repo (no `security` import); the controller's
    `get_admin_audit` composes it with `Depends(get_current_user_id)`. Entity/port: `domain/admin_audit.py`
    + `AdminAuditRepository`; recorder: `application/admin_audit_recorder.py`.

## Endpoint map (all under `/v1/admin/save/*`, gated)

- Review (MATCHING_REVIEW): `GET /review-queue`, `GET /review-queue/{id}`, `POST /review-queue/{id}/resolve`, `POST /review-queue/create-canonical`, `POST /review-queue/bulk-resolve`
- Ingestion (INGESTION_OPS): `GET /providers` (admin DTO — full type/platform/market, replaced the public `listProviders`, #11), `POST /providers`, `PATCH /providers/{id}`, `PATCH /providers/{id}/logo`; `POST /sources`, `PATCH /sources/{id}`, `POST /sources/{id}/pause|resume`, `POST /sources/{id}/test`, `GET /sources/health`; `GET|POST /basket-queries`, `PATCH|DELETE /basket-queries/{id}`

## How to add a new admin resource (the recipe)

1. Backend: use-case(s) in `application/`, port + `Sql*Repository`, thin routes on `ingestion_router`
   (or a new gated router) — `response_model` on each → `make openapi`. RED-first.
2. Web: `src/features/admin/resources/<r>/{api.ts (thin wrappers + authHeaders),types.ts,components/<X>Screen.tsx}`.
3. Route trio `pages/admin/<r>/{+Page.tsx (thin re-export), +data.ts (SSR list), +guard.ts (COPY an
   existing one, its capability)}`.
4. Register in `ADMIN_RESOURCES[]` (`admin-resource.ts`) — append, don't reorder. Nav filters by capability.
5. **i18n from the start** (gotcha #8): thread `locale` through `+data.ts`, use `useAdminI18n(locale)`,
   add keys to `messages.ts` (all 3 locales). **Audit every mutation** at the controller (gotcha #13).
   Do NOT add a ClerkProvider anywhere. Mirror the existing resources' structure.

## Commands

```bash
# backend
cd apps/api && uv run pytest tests/save -q          # (needs make db-up)
uv run ruff check src tests && uv run lint-imports
make openapi                                         # after any DTO/endpoint change
# web
pnpm --filter @cuadra/web typecheck                  # the contract test
pnpm --filter @cuadra/web test
# see it locally (dev): api:8005 · web:3006 · db:5433 — one call grants admin access + re-seeds identity:
curl -s -X POST http://localhost:8005/v1/identity/dev-login -H 'Content-Type: application/json' \
  -d '{"email":"you@cuadra.do","role":"super_admin"}'   # → token; the web mirrors it into the __session cookie
# smoke the SSR gate: 403 without the cookie, 200 (rendered) with it:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3006/admin/providers -H "Cookie: __session=<token>"
# routes: /admin/review-queue · /admin/providers · /admin/sources · /admin/basket-queries  (no bare /admin index)
```

## Status + what's left

- **Built (F2·B1 + Fase 3 P0):** all of Phase 1-3 above. **Fase 3 P0 DONE** (branch
  `feat/save-fase3-fundaciones`): T2 reusable audit (gotcha #13); `GET /admin/save/providers` admin DTO
  (#11 — the public `listProviders` is gone from the admin); dev-login re-seeds + `role` for local admin
  access (10.C/10.B); SSR gate closed with the dev-login cookie bridge + robust parent guard (10.D);
  i18n providers+sources es/en/pt (10.A). Smoke-verified live (10.E).
- **Full pending list:** `docs/pending/save-admin-review-pendientes.md` — the source of truth. Highlights:
  - **P1 Phase 4 (Observability):** `GetMatchingMetrics` (auto-link rate, %-to-judge, judge cost/latency
    p50/p95/p99, NEVER average-only) + `MatchingMetricsScreen` (tasks 4.1-4.6).
  - **P1 Providers redesign (§7.2):** the list now has the admin DTO (type/platform/market) but the UI
    still edits only name+logo; editing type/platform in the form is the next step.
  - **P2 follow-ups:** `position` reorder unused downstream; provider logo not in `compare-table`
    (ComparedPriceDto); T3 destructive-state policy (soft-delete for basket).
  - **Orchestration (F4) is COMPLETE — merged to `developer` (PR #37).** Deep-link run→queue + cascade
    ACTIVATED and measured. See `cuadra-save-orchestration` and
    `docs/pending/save-fase4-orquestacion-pendientes.md`. Follow-ups it leaves for the console:
    provider-detail page · `scope=asset` policies (until they exist, the three `ScheduleDefinition`
    stay in code on purpose) · the "Assets Dagster" tab · re-enable the LLM judge.
  - **The admin's switches REACH the ingestion (R1):** the per-query discovery derives its stores from
    `store_registry` (active × `directed_capability(...).by_text`), so `enabled`/`paused_at` take a store
    out of ingestion. Adding a súper is a ROW. Note for Orchestration (F4): provider-flow compatibility
    must derive from `directed_capability`, never an allowlist.

## Resources

- **Plan + task checklist:** `docs/sdd/save-admin-review/{plan.md,features.md}` · aispace-men `sdd/save-admin-review/*`
- **Composes with:** cuadra-save · cuadra-save-matching · cuadra-web · cuadra-api · cuadra-clerk

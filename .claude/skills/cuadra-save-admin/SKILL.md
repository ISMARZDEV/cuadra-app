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
  chrome, the SSR gate needs a real Clerk cookie (dev-login localStorage is unreachable SSR → always
  403), source health is DERIVED (manual-pause + freshness, no auto-detection), TestSource is an
  SSRF-guarded dry-run that never persists, and the capability seed must be RE-RUN after Phase 1.
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
Two capability domains gate it: `ADMIN_SAVE_MATCHING_REVIEW` (the review queue) and
`ADMIN_SAVE_INGESTION_OPS` (providers/sources/basket/health/metrics).

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
2. **Vike guards do NOT compose** — only the most-specific `+guard.ts` runs per route. The parent
   `pages/admin/+guard.ts` only checks `ADMIN_RESOURCES[0]`. So EVERY admin route subtree whose
   capability differs needs its OWN `pages/admin/<resource>/+guard.ts` re-checking its capability
   (`hasAdminCapability(pageContext.headers, "<cap>")` → `throw render(403)`). Copy an existing one.
3. **Admin sheds the marketing chrome via `+Layout.clear.tsx`.** The `.clear` suffix resets the
   inherited config chain so `/admin/*` does NOT get LayoutDefault's SiteHeader/SiteFooter. The
   `Wrapper` is a SEPARATE config, unaffected by `.clear` — so ClerkProvider still applies.
4. **The SSR gate needs a real Clerk COOKIE.** `require-admin.ts` reads the `__session` cookie (or
   Authorization header) server-side → calls `/identity/me`. **dev-login stores its token in
   localStorage → unreachable SSR → `/admin/*` ALWAYS 403 with pure dev-login.** To view locally:
   log in via Clerk, OR set a dev HS256 token (`encode_token({"sub": user_id})`) as the `__session`
   cookie. The user needs `super_admin` (no admin is seeded — JIT provisions as normal_user).
5. **Capabilities seed must be RE-RUN after Phase 1.** `seed_identity` uses `on_conflict_do_nothing`;
   a DB seeded before B1 is MISSING `admin_save_*` capability + role_capability rows → super_admin
   still gets 403. Fix: re-run `seed_identity` (idempotent) + INSERT into `identity.user_role`.
6. **Source health is DERIVED at read-time, not stored/detected.** `derive_source_health(paused,
   max_last_seen_at, now)` → `paused | stale | ok` from TWO real signals only: manual pause
   (`paused_at`) + freshness (`store_product.last_seen_at`). NO schema-break/error-rate/auto-pause —
   that hook doesn't exist in the pipeline (checkpoint 3.17); do NOT fake it.
7. **TestSource is a dry-run: SSRF-guarded, ZERO persistence.** `ssrf_guard.py`: https-only,
   pre-connect `getaddrinfo` rejecting loopback/private/link-local/CGN (via `not is_global`),
   `follow_redirects=False`, size/timeout caps. It NEVER calls a repo. The route returns 200
   (sample) / 422 (config or SSRF-blocked) / 502 (upstream failed) — the web MUST distinguish them.
   Residual DNS-rebinding TOCTOU is documented, not closed (admin-only, low-volume).
8. **i18n in the admin is now REQUIRED (decision reversed 2026-07-06).** It shipped WITHOUT i18n
   ("internal tool", see AdminLayout) but the user reversed that — admin must support es/en/pt.
   Gotcha: `/admin/*` is EXEMPT from the `/{locale}/{country}/` URL prefix, so `usePageI18n()` (URL-
   sourced) won't work — derive the locale from the AUTHENTICATED USER instead (`MeResponse.locale`,
   already returned by `/identity/me`; thread it through `pages/admin/+data.ts`). Full plan +
   approach: `docs/pending/save-admin-review-pendientes.md` (P0). Until done, admin strings are
   hardcoded Spanish.
9. **Web data: SSR `+data.ts` for lists, `authHeaders()` for mutations.** NO TanStack Query. After a
   mutation, refresh via `use-admin-list.ts` (`useAdminList(initial, fetcher)` — seeded from the SSR
   prop, re-fetches into local state) — NOT `window.location.reload()`.
10. **`product_match` is the single source of truth for a link** (cuadra-save-matching): `ResolveReview`
    writes `store_product.canonical_product_id` + the match status in ONE transaction. Reject REQUIRES
    a `reason_code`. Never bypass the use-case.

## Endpoint map (all under `/v1/admin/save/*`, gated)

- Review (MATCHING_REVIEW): `GET /review-queue`, `GET /review-queue/{id}`, `POST /review-queue/{id}/resolve`, `POST /review-queue/create-canonical`, `POST /review-queue/bulk-resolve`
- Ingestion (INGESTION_OPS): `POST /providers`, `PATCH /providers/{id}`, `PATCH /providers/{id}/logo`; `POST /sources`, `PATCH /sources/{id}`, `POST /sources/{id}/pause|resume`, `POST /sources/{id}/test`, `GET /sources/health`; `GET|POST /basket-queries`, `PATCH|DELETE /basket-queries/{id}`

## How to add a new admin resource (the recipe)

1. Backend: use-case(s) in `application/`, port + `Sql*Repository`, thin routes on `ingestion_router`
   (or a new gated router) — `response_model` on each → `make openapi`. RED-first.
2. Web: `src/features/admin/resources/<r>/{api.ts (thin wrappers + authHeaders),types.ts,components/<X>Screen.tsx}`.
3. Route trio `pages/admin/<r>/{+Page.tsx (thin re-export), +data.ts (SSR list), +guard.ts (COPY an
   existing one, its capability)}`.
4. Register in `ADMIN_RESOURCES[]` (`admin-resource.ts`) — append, don't reorder. Nav filters by capability.
5. Do NOT add a ClerkProvider anywhere. Do NOT add i18n. Mirror the existing resources' structure.

## Commands

```bash
# backend
cd apps/api && uv run pytest tests/save -q          # (needs make db-up)
uv run ruff check src tests && uv run lint-imports
make openapi                                         # after any DTO/endpoint change
# web
pnpm --filter @cuadra/web typecheck                  # the contract test
pnpm --filter @cuadra/web test
# see it locally (dev): api:8005 · web:3006 · db:5433
uv run python -c "from src.shared.db.base import SessionLocal; from seeds.identity_seed import seed_identity; s=SessionLocal(); seed_identity(s); s.commit()"  # refresh capabilities
# then grant super_admin: INSERT INTO identity.user_role(user_id, role_key) VALUES ('<uuid>','super_admin') ON CONFLICT DO NOTHING;
# routes: /admin/review-queue · /admin/providers · /admin/sources · /admin/basket-queries  (no bare /admin index)
```

## Status + what's left

- **Built (F2·B1):** all of Phase 1-3 above. Backend 675 tests + web 125 tests green.
- **Full pending list:** `docs/pending/save-admin-review-pendientes.md` — the source of truth. Highlights:
  - **P0 i18n in the admin** (decision reversed — see gotcha #8).
  - **P1 Phase 4 (Observability):** `GetMatchingMetrics` (auto-link rate, %-to-judge, judge cost/latency
    p50/p95/p99, NEVER average-only) + `MatchingMetricsScreen` (tasks 4.1-4.6).
  - **P2 follow-ups:** ingestion cutover to read `basket_query` (still reads hardcoded `BASKET_QUERIES`);
    no admin provider/source LIST endpoint; `position` reorder unused downstream; provider logo not in
    `compare-table` (ComparedPriceDto); no manual browser E2E of the authed panel.
  - **OPS:** re-run `seed_identity` post-Phase-1; no seeded super_admin; `dev-login` returns 500;
    SSR gate needs a Clerk cookie.

## Resources

- **Plan + task checklist:** `docs/sdd/save-admin-review/{plan.md,features.md}` · aispace-men `sdd/save-admin-review/*`
- **Composes with:** cuadra-save · cuadra-save-matching · cuadra-web · cuadra-api · cuadra-clerk

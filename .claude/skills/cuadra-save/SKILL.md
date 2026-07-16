---
name: cuadra-save
description: >
  End-to-end architecture of Save — Cuadra's supermarket price-comparison vertical (parity with
  SupermercadosRD + the moat they can't copy). Covers the doctrine and SACRED rules, the backend
  bounded context (contexts/save, hexagonal + medallion pipeline + matching), the schema, the
  contract-first API, the web + mobile feature structure, the LangGraph agent, and the F0-F3
  roadmap. This is the domain skill; it composes with cuadra-web / cuadra-mobile (app conventions).
  Trigger: Building or extending ANY part of Save — backend domain/endpoints, the ingestion
  pipeline/adapters/matching, the web or mobile Save UI, the PurchasesAgent, or the price schema.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.1"
---

> **Your role:** a software architect with 15+ years in web-data pipelines + entity resolution,
> data orchestration, and RAG/LangGraph agents. Save is a **fintech** feature where **trust IS the
> product** — a wrong or stale price destroys it. You protect the doctrine below; when a shortcut
> would let the AI touch a number, mix price types, or float money, you STOP.

> **Compose — don't duplicate.** App conventions live in `cuadra-web` (the web app, SSR/SEO) and
> `cuadra-mobile` (the Expo app). Agent prompts → `cuadra-agent-prompts`. Branch/PR/CI →
> `cuadra-git-workflow`. THIS skill owns the Save DOMAIN across all layers. The full design +
> evidence lives in `docs/research/save-fable/` (14 append-only docs, decided); read it for the WHY.

> **Research the state of the art FIRST (2025-2026) — a standing priority, not an afterthought.**
> Before building or choosing anything non-trivial (an adapter, a matching/ML approach, an embedding
> model, an architecture, a security-sensitive flow), do NOT code from memory. Investigate and be
> CRITICAL: current official docs, high-signal GitHub repos, papers, engineering blogs and forums,
> and **how successful projects with strong architectures solve it** — plus the security/legal angle
> (scraping ToS, PII, OWASP). Compare options with honest trade-offs, verify claims (versions,
> benchmarks, maintenance), prefer the recent + maintained, and flag anything unverified as "to
> verify", never as fact. The `docs/research/save-fable/` docs are exactly this done well (evidence +
> alternatives + decision) — extend that rigor; re-check the stack hasn't moved. Grounded decisions
> over confident guesses. Use web search / fetch the real docs; don't assume.

## When to Use

- Backend: entities/use-cases/repos in `apps/api/src/contexts/save/`, endpoints, migrations of schema `save`.
- Ingestion: `apps/api/ingestion/` (Dagster), `CatalogSource` adapters, normalization, matching.
- Frontend: the Save UI in `apps/web` (`features/save`) or `apps/mobile` (`features/save`).
- The agent: `PurchasesAgent` / `CoachAgent` tools in `contexts/aispace`.
- Any change to the price/catalog model or the comparison logic.

## Critical Patterns

### 0. What Save is (and the moat)

Save = compare & transparent supermarket prices in RD (**parity** with SupermercadosRD: search,
compare, unit-price, categories, offers, price history, basket, alerts, SEO) **+ the foso they
can't copy**: (1) the **triangle** Insights×Save over the user's OWN transactions ("you paid 12%
more than at Bravo"), (2) **real shelf price** via receipt OCR / e-CF, (3) the **conversational
sub-agent** (AISpace). The comparison itself is table-stakes; the moat is the triangle + shelf
price + agent + the append-only price history. Expands later to financial products (banks/insurers).

### 1. The FOUR SACRED RULES (non-negotiable — a violation is a P0)

1. **The AI STRUCTURES and RETRIEVES, it NEVER computes a price.** Every number comes from Postgres
   as an integer; the pipeline's LLM parses dirty HTML/size strings, the agent picks a tool and
   CITES the tool's number — neither ever emits a price it made up. (Cleo reported $28K for a $3K
   balance by letting the LLM do math. Don't.)
2. **Money in MINOR UNITS (BIGINT), always.** Never float/double for money. Format only at the UI
   edge (`formatMoney`). Unit-price is computed in integers in the domain.
3. **`price_type` is labelled and NEVER mixed.** `online | delivery | shelf | receipt` — online ≠
   shelf (evidence: online often 15-20% higher). A comparison compares WITHIN one `price_type`
   unless the user explicitly opts in. Delivery (aggregators) is the most inflated.
4. **Integrate PLATFORMS, not chains.** One `VtexAdapter` serves Sirena + Carrefour + much of LatAm;
   one adapter per platform → N chains → N countries. A new country = a row in a registry, not code.
   Never write "one scraper per chain."

### 2. Where Save lives (layer map)

| Layer | Path | What |
|---|---|---|
| Backend domain | `apps/api/src/contexts/save/{domain,application,infrastructure}/` | Hexagonal (ADR 31): `domain/` PURE (no ORM), `application/` use-cases+DTOs, `infrastructure/` repos+adapters. |
| Ingestion | `apps/api/ingestion/save/` | Dagster module (NOT `apps/ingestion` yet): 1 asset per source + `price_drops`; isolated dep-group so the API deploy doesn't pull Dagster. |
| API | `apps/api/src/api/v1/controllers/save.py` | Thin HTTP boundary; `/save/*` public catalog (no auth). |
| Schema | Postgres schema `save.*` (ADR 33) | Own schema; cross-context refs by UUID, NO FK across schemas; `user_id`/`market_id` by ID. |
| Web UI | `apps/web/src/features/save/` | See `cuadra-web` (SSR/SEO, mirror of mobile). |
| Mobile UI | `apps/mobile/src/features/save/` | See `cuadra-mobile`. Today = alerts screen; marketplace UI is F2. |
| Agent | `apps/api/src/contexts/aispace/agents/purchases/` | `PurchasesAgent` + `CoachAgent` (triangle fan-out). |

### 3. Domain model (schema `save`)

```
provider(id, name, type[super|bank|insurer], platform, market_id)
taxonomy_node(id, parent_id, name, level, market_id)          -- hierarchical tree; slug derived from name
canonical_product(id, slug, name, brand_id, quality, display_size, image_url,
                  size_amount, size_measure, taxonomy_node_id, market_id)  -- UNIQUE(market_id, slug)
store_product(id, provider_id, canonical_product_id, current_price_minor, currency, url, ean?, last_seen_at)
product_match(store_product_id, canonical_product_id, confidence, method[ean|trgm|vector|llm|human])
price(id, store_product_id, value_minor, currency, captured_at, price_type, source)  -- APPEND-ONLY
offer(id, provider_id, canonical_product_id, offer_price_minor, valid_until)
collection(id, slug, name, market_id) + collection_product(...)  -- curated rails (A6), M:N, UNIQUE(market_id, slug)
shopping_list(user_id) + list_item(...)   ·   price_alert(id, user_id, canonical_product_id, threshold_minor)
```

- **`canonical_product.slug`** = public URL key (SEO). The repo `add()` auto-generates it
  (`product_slug(name, brand, display_size)`) and dedupes per market (`-2`, `-3`). Resolve by slug
  with UUID fallback (**permalink pattern**); the web `canonical` tag always points to the slug.
- **`price` is APPEND-ONLY + change-only:** insert a row ONLY when the price changes; otherwise bump
  `store_product.last_seen_at`. This is the moat (time-series) AND keeps storage tiny.
- **Everything money = minor units.** Taxonomy has no `slug` column (derived via `slugify`).

### 4. The data pipeline (medallion; matching = 70% of the work)

`CatalogSource` (port) → **BRONZE** (raw, hashed, idempotent) → normalize → **SILVER** (clean, unit
base) → **matching** → **GOLD** (canonical_product + store_product + price). Access doctrine, highest
tier first: **official API → mobile-app API → structured feed → AI agent (Firecrawl) → browser**.

- **Verified live sources (F0/F1):** Sirena (VTEX, has EAN+taxonomy), Nacional + Jumbo (Magento
  GraphQL; Jumbo via `Store: jumbo` header). Plaza Lama/Carrefour/aggregators = F2+ (see doc 09).
- **Matching cascade (the 70%):** `EAN → pg_trgm (lexical blocking) → BGE-M3/pgvector (semantic
  blocking) → Claude judges the grey band → human review queue`. Nothing below the threshold
  auto-merges; `confidence` explicit. Bootstrap with a curated ~200-SKU basket (solves cold-start).
- **Break detection:** an adapter returning 0 products / changed schema → alert, never silent fail.
- **2026 stack watch (benchmark at F2, don't assume):** Splink stays the reference, but evaluate
  **GoldenMatch** (Fellegi-Sunter, SQL-native in Postgres/DuckDB) head-to-head. Embeddings: BGE-M3 is
  the OSS workhorse, but **Qwen3-Embedding** now leads MTEB multilingual — benchmark both on the RD
  catalog. Principle that holds either way: deterministic scoring > LLM generation for the match decision.

### 5. Contract-first API

Endpoints are generated into `@cuadra/api-client` from OpenAPI — NEVER hand-edit the generated
client. Change a DTO/endpoint → `make openapi` → web + mobile typecheck go red on breaking changes.
Core `/save/*` endpoints: `search · compare (by slug) · featured · categories · category/{slug} ·
collections · collection/{slug} · deals · providers · store/{id} · history · products (sitemap) ·
alerts (subscribe/list/notifications/run-matching)`. Public catalog needs no auth (price data).

### 6. The agent (PurchasesAgent / CoachAgent)

Router → `PurchasesAgent` (Save node). **Prices come from FIXED deterministic tools, NEVER
text-to-SQL** (`compare_prices(id)` runs written+tested SQL; the LLM picks the tool + formats,
never writes the query → no hallucinated columns/aggregations, no injection). Retrieval (hybrid
pg_trgm + pgvector, RRF, conditional rerank) resolves fuzzy INTENT only ("arroz Rica" → product
id); prices are always the tool's. Mutations (add_to_list, set_price_alert) are HITL (`interrupt()`).
`CoachAgent` = fan-out of the triangle (Insights × Save). Grounding: context-only, cite
`source + captured_at + price_type`; faithfulness eval (RAGAS + LangSmith; 2026 stack also Phoenix/
Langfuse) is the release gate. **Caveat (2026):** a RAG answer can score 0.95 faithfulness and still
be WRONG if the retrieved price is stale — that's exactly why prices go through deterministic tools
with a **freshness SLA** (`captured_at`), never through RAG. Faithfulness ≠ correctness.

### 7. Roadmap / current state

- **F0 (done):** domain + unit-price normalization + VtexAdapter (Sirena) + curated basket + compare/search.
- **F1 (done):** Shopify/Magento adapters + web portal (search→category→product) + shopping list (D1)
  + price alerts (G4) + price history (C9) + curated collections (A6) + product slug SEO + Dagster module.
- **F2 (mostly done):** auto-matching cascade ✅ (skill `cuadra-save-matching`; activate with
  `SAVE_MATCHING_CASCADE_ENABLED=true`) + **OFV admin console** ✅ (skill `cuadra-save-admin`: review
  queue, providers, **sources**, basket). Still to do: PurchasesAgent + receipt OCR / e-CF + aggregators
  (Apify) + RAGAS/LangSmith evals.
- **F3 — two-loop ingestion ✅ built** (SDD `docs/sdd/save-ingesta-dos-loops.md`; see §8): Loop B directed
  coverage + F3.2a freshness + F3.3 resilience + **Authenticated Sources** (Bravo detail live). Still to
  do: F3.2b recovery, F4 isolated Loop A, activate Loop B/freshness in Dagster with real data. Multi-country
  via `store_registry` + financial vertical (`provider.type=bank|insurer`) comes later.
- **Known follow-ups:** `docs/pending/save-matching-batch10-y-activacion.md` (activate the cascade +
  BGE-M3-vs-Qwen3 spike), `docs/pending/save-web-f1-pendientes.md` (SEO/hardening),
  `docs/pending/save-alerts-remote-push.md` (remote APNs needs paid Apple). i18n es/en/pt for save-sources.

### 8. Two-loop ingestion + Authenticated Sources (F3, built — SDD `save-ingesta-dos-loops.md`)

**Two loops** (parity with SupermercadosRD `docs/research/supermercadosrd-scrapers-teardown-y-plan-cuadra.md`):
**Loop A** (discovery, broad/periodic) grows the canonical catalog from the Curated Basket (`basket_query`).
**Loop B** (coverage, directed/frequent) fills the price×store matrix of what's ALREADY known. Loop B NEVER
creates canonicals. Lives in `apps/api/ingestion/save/` (Dagster assets `coverage` + `freshness`, own schedules).

- **F3.3 resilience** (`domain/{coverage.py,fetch_outcome.py}`, `catalog_sources/fetch_classifier.py`):
  `round_robin_by_store` (spreads load — but it does NOT rate-limit: with ONE store it is a no-op, so every
  network loop ALSO needs `pace`, see `cuadra-save-ingestion`), typed `FetchOutcome` (`retryable`/`hide`) + `classify_httpx_error`
  (401/403→AUTH_FAILED · 5xx/429/timeout→BACKEND_DOWN · 404→NOT_FOUND), abort-on-down (a downed store skips
  its remaining pairs). The httpx classifier lives ONLY in infra; the use-case decides from the flags.
- **Loop B DIRECTED coverage** (`application/cover_canonicals.py`, `domain/candidate_selection.py`): for each
  uncovered (canonical×store), it builds an EAN-first query (`build_directed_query`) and **takes the BEST
  candidate FOR that canonical** (`select_ean_match`: the one carrying the target barcode, or NONE — the
  name-trigram fallback died with R4) — it does
  NOT ingest all ~65 search results. That single candidate goes through the SAME cascade (deterministic
  auto-link if strong, NO LLM). **Gate (CORRECTED 2026-07-15 — it used to say "only VTEX/Magento/Shopify"):**
  capability is per-SOURCE with TWO independent axes, `DirectedCapability{by_ean, by_text}`, computed by INFRA
  (`factory.directed_capability`) because it can depend on the REST profile — a platform cannot answer for all
  its profiles. Bravo finds by barcode (`filterByEan`) AND by text (`/articulo/search?showOrder=score`,
  unblocked 2026-07-16 → the ONLY store with both). **R4 (2026-07-16) split them by PROCESS:** Loop B
  is **barcode-pure** (`by_ean` only; a no-`by_ean` store is skipped, and so is a canonical with no
  known barcode — `list_uncovered` filters to EAN-reachable ones, R5), while `by_text` powers the
  per-query DISCOVERY (R1), which is where no-EAN canonicals get found by NAME with a review queue
  behind them. Loop B takes ONLY the candidate carrying the target barcode (`select_ean_match`) and
  DISCARDS otherwise — never queues, never falls back to the closest name. Measured
  matrix + per-store playbook: skill **`cuadra-save-ingestion`**. (Learned live: without top-candidate it
  covered 1/23; with it, 21/50.)
- **F3.2a freshness** (`application/refresh_covered_prices.py`): keeps covered prices fresh.
  `list_stale_covered` (TTL 18h visible / 3d hidden, SRD §3.1 pattern) → **path A**: DIRECT re-fetch by
  id/url (`ProductDetailSource.fetch_by_external_id`, VTEX productId / Magento SKU / REST `/get`) →
  `record_observation` (change-only, already built: same price = just bump `last_seen_at`, different = new
  history row). NO matcher (the link is already known). **A→C fallback**: detail not usable (no token/403
  AUTH_FAILED, no locator `DetailUnavailable`, or platform has no detail) → does NOT mark unavailable →
  refreshes by BROWSE once per provider (`build_browse_source`, REST only). `is_available=false` ONLY if A
  found-nothing WITH valid access. **F3.2b recovery (phase 1) is BUILT**: A-finds-nothing → ask the store
  for the CANONICAL's barcode → auto-repair `repair_locator` ONLY on an exact single-EAN hit; different EAN,
  ambiguous (>1) or no known EAN → hide, never auto-apply. Name-based proposals = phase 2 (deferred; needs a
  `recovery_proposal` table). SRD cannot recover Bravo at all (`RecoverableShopId=1|2|3|4`, Bravo=6).

**Authenticated Sources (§15 of the SDD)** — the credential lives in the DB (`store_registry.auth/headers`
JSONB), editable in the admin UI (skill `cuadra-save-admin`), applied by ALL adapters. Zero hardcoding.
- **TYPED auth model** (`infrastructure/catalog_sources/source_auth.py`, Postman/Airbyte pattern):
  `{type: bearer|api_key{in:header|query}|basic|none}`. `build_request_auth(headers, auth) → RequestAuth`;
  `authed_http_get/post` (auth-aware transport the **factory injects** when the source has a credential —
  reuses TestSource's `http_get`/`http_post` seam); `mask_auth` masks the secret on reads/logs (write-only).
  `store_registry.headers` = static NON-secret headers (Host, User-Agent).
- **`source_ref`** (JSONB on `store_product`): detail locator when `external_id` isn't enough — Bravo
  `{"id_articulo": …}` (its `/get` uses idArticulo, not the idexterno that IS the external_id). The REST
  profile declares detail (`CatalogProfile.detail_path/param/ref_key/item_path` → `RestCatalogDetailAdapter`).

**REST_CATALOG (own-API supers, e.g. Bravo) — browse-by-section for DISCOVERY.** VTEX/Magento query the
Curated Basket; a REST súper browses its FULL catalog per section for Loop A because its API ignores TEXT
search — but that is not the same as "ignores search": Bravo does expose an exact **barcode** lookup
(`model.filterByEan`, global, 1 request), which is what makes Loop B and recovery work on it.
- **Add/extend a REST súper = data, not code**: one `*_profile.py` (`CatalogProfile`) registered in
  `factory.py::_REST_CATALOG_PROFILES` + a `store_registry` row (`platform=REST_CATALOG`,
  `endpoints={profile, sections:[...], store_id}`, `auth`). `RestCatalogAdapter` is generic — do NOT write a
  per-chain adapter. The profile declares: list path/params + item mapper, `extra_params` (Bravo requires
  `showOrder`), `default_headers` (structural non-secret headers → gotcha #2), `detail_*` (the `/get` locator,
  freshness path A), `page_size`.

**Dagster orchestration** (`apps/api/ingestion/`, UI :3070 via `scripts/dagster-dev.sh`; shares its wiring with
the `seeds.save_refresh` CLI — one source of truth in `ingestion/save/composition.py`).
- Query-based supers = ONE **partitioned** asset `query_catalog_prices`, **one partition per PROVIDER**
  (R1, 2026-07-16 — the hardcoded `SOURCE_KEYS`/`build_sources` "F1 bridge" is DEAD). The set is derived
  from `store_registry` (active × `directed_capability(...).by_text`) and a sensor
  (`sync_query_catalog_providers`) keeps the partitions in sync → **adding a súper is a ROW, not a deploy**,
  and `enabled`/`paused_at` finally take a store out of ingestion. **Seed the registry for every chain**
  (`save_seed.STORE_SOURCES` + migration `a5b6c7d8e9f0`): before R1 only Bravo was seeded, so a fresh DB
  would have silently ingested ONE store.
- **The daily chain is DECLARATIVE, not clock-driven** (2026-07-16): `embed_canonicals` holds the only cron
  (`AutomationCondition.on_cron("0 6 * * *")`); the rest is pulled by dependency. Partitioning kicks the
  discovery out of the unpartitioned daily job (Dagster won't mix), and chaining by clock would let the
  discovery run on a stale index if embed ran long — silently. **Gotcha:** `price_drops`/`alert_matching`
  must NOT use `eager()` ("will not execute targets that have any MISSING dependencies") — they also dep on
  the MANUAL REST browse, whose partitions may never have been materialized ⇒ eager blocks them FOREVER and
  price-drop alerts never fire. Use eager MINUS `~any_deps_missing`, keeping `~any_deps_in_progress`. REST supers = ONE **partitioned** asset `rest_catalog_prices`,
  **one partition per (provider, section)** — `DynamicPartitionsDefinition` key `{provider_id}:{section}`
  (`composition.py::rest_catalog_partition_key/parse.../build_rest_catalog_source_for`). Sensor
  `sync_rest_catalog_sections` keeps partitions in sync with `store_registry`. Trigger per-partition / backfill
  (its own `save_rest_catalog` job) — it is EXCLUDED from the unpartitioned daily `save_catalog_refresh` (a
  partitioned asset can't live in an unpartitioned job); an automatic daily partition backfill is a follow-up.
- **Instance storage = Postgres, NOT the SQLite default** (`scripts/dagster.yaml` → copied to `$DAGSTER_HOME` by
  `dagster-dev.sh`; dedicated `dagster` role/db in cuadra-db; dep `dagster-postgres`). Two Dagster processes on
  ONE SQLite `$DAGSTER_HOME` deadlock on the lock; Postgres makes a one-off safe WHILE `dagster dev` runs, and
  enables `run_monitoring` (auto-fails orphaned/killed runs) + `run_retries`. Never leave `dagster.yaml` in the
  `dagster dev` CWD (`apps/api`) → Dagster warns and ignores it; keep it in `scripts/`. CLI
  `dagster asset materialize` is superseded → prefer `dg launch --assets … --partition …`. (macOS has no
  `timeout` — use `gtimeout` or none.)

**Gotchas (hard-won — do NOT relearn):**
1. **TLS = OS trust store, not certifi.** Some super APIs (Bravo) send a chain with an intermediate that
   certifi does NOT carry but the system DOES → httpx fails `self-signed certificate in chain` even though
   `openssl s_client` verifies OK. Fix: `request_with_retry` verifies with `truststore.SSLContext` (dep
   `truststore` in the ingestion group). Still SECURE (does not disable verification). Diagnosis: if ONLY
   one source fails SSL while the rest are OK → it's not the network, it's its chain → truststore.
2. **Bravo `/get` is gated on the token AND the User-Agent.** It requires `X-Auth-Token` **and** its iOS
   app UA (`Domicilio/122130 CFNetwork/… Darwin/…`, see SRD `getBravoHeaders` http-client.ts:427-438).
   Token-only = 403. → the STRUCTURAL headers (UA + `Accept*`, non-secret, platform-fixed) live in the
   REST profile (`CatalogProfile.default_headers`, e.g. `bravova_profile.py`), NOT the admin — the factory
   feeds them as `build_request_auth` defaults, and `store_registry.headers` still override them (back-compat).
   Only the token (secret, the app's static token — no refresh) goes in the admin, in `auth`.
3. **The secret goes in the `value`/token field, NOT `name`** (the header name = "X-Auth-Token"). The admin
   modal pre-fills the name and labels the field "Token / valor (el secreto)".
4. **The admin sources list returns the auth MASKED** (`SourceHealthDto` via `mask_auth`) + config
   (headers/endpoints) to prefill the edit modal; the secret never leaves in cleartext.
5. **`record_candidates` MUST stay idempotent (replace, not append).** `record_match` UPSERTS by
   `store_product_id` (re-running the cascade reuses the SAME match id). So `record_candidates` DELETEs the
   match's prior `review_candidate` rows + dedups candidates by canonical BEFORE inserting — otherwise
   re-matching a product already in the review queue violates `uq_review_candidate_match_canonical` and ABORTS
   the transaction (this surfaced as an ingestion "hang" in the Dagster subprocess, not a crash).
6. **"Ingestion hung" is almost always SLOW, not stuck.** Loop A over a REST súper embeds EVERY new product
   with in-process BGE-M3 (CPU, ~seconds each); Bravo has ~41 sections, so a monolithic browse looks dead (no
   per-item log). Fix visibility with per-section partitioning + `on_progress`; the real speed lever is the HTTP
   embedding endpoint (`SAVE_BGE_M3_ENDPOINT_URL`). To tell slow from a REAL stall: `faulthandler.dump_traceback_later`
   (py-spy needs sudo on macOS) + check `pg_stat_activity` for `idle in transaction`. When the LLM judge is down
   (OpenAI 429) the `LlmCircuitBreaker` opens after 3 fails and the rest degrade to review WITHOUT API calls —
   the browse still completes (everything goes to the human queue).

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Every price is a BD integer the AI cites | Let an LLM compute/emit a price |
| Money in minor units; format at the UI edge | float/double for money |
| Label `price_type`; compare within one type | Mix online/delivery/shelf in one comparison |
| One adapter per PLATFORM behind `CatalogSource` | One scraper per chain |
| `price` append-only + change-only writes | UPDATE a price row |
| Fixed tools for the agent's prices | text-to-SQL for user-facing prices |
| Confidence + human queue below threshold | Auto-merge a low-confidence match |
| Prefer official API / receipt (legal) | Lean on aggregator scraping as the backbone |
| Strict TDD (RED→GREEN) on domain logic | Ship price/matching logic untested |
| Loop B: ONLY the candidate carrying the target barcode (`select_ean_match`) | Ingest all ~65 results / fall back to the closest NAME |
| Source credential in `store_registry.auth` (typed, masked) | Hardcode tokens/headers in the code |
| Platform-fixed non-secret headers in the profile (`default_headers`) | Make the admin re-enter the User-Agent each time |
| TLS via the OS trust store (`truststore`) | Disable TLS verification (`verify=false`) |
| A→C fallback (browse) when detail isn't usable | Mark `is_available=false` for a missing token/locator |
| Partition the REST browse per section (visible, retryable) | One monolithic browse of all ~41 sections |
| Dagster instance storage on Postgres (`scripts/dagster.yaml`) | A one-off `dagster asset materialize` against a SQLite `$DAGSTER_HOME` while `dagster dev` runs |
| `record_candidates` replaces the candidate set (idempotent) | Append candidates on a re-match (uq violation → aborts the txn) |

## Commands

```bash
make openapi                              # after any Save DTO/endpoint change → regen api-client
cd apps/api && uv run pytest tests/save   # backend Save suite (unit + integration; needs cuadra-db)
cd apps/api && uv run alembic upgrade head # apply schema `save` migrations to the DB
make save-refresh                         # manual catalog refresh (CLI, no Dagster) — same wiring as the assets
./scripts/dagster-dev.sh                  # Dagster dev UI :3070 (Postgres storage + sensor; NOT bare `dagster dev`)
./scripts/dagster-down.sh                 # stop the dev server tree cleanly
# materialize ONE REST section partition (key = {provider_id}:{section}); needs the partition to exist
#   (the sensor adds them) + Postgres env from dagster-dev.sh:
cd apps/api && DAGSTER_HOME=$HOME/.cuadra-dagster SAVE_MATCHING_CASCADE_ENABLED=true \
  uv run --group ingestion dagster asset materialize --select rest_catalog_prices --partition "<pid>:<section>" -m ingestion.definitions
```

## Resources

- **Design source of truth (why):** `docs/research/save-fable/` — 08 = integrated architecture +
  roadmap, 05 = matching, 06 = platform/Dagster, 07 = RAG/agent, 01 = OCR/e-CF, 09 = live endpoint spike.
- **Context:** `docs/research/save-ingesta-fuentes-rd.md` (sources), `docs/research/supermercadosrd-analisis.md`
  (competitor), `docs/arquitectura-mvp.md` §6 (Save) + §12·B (money) + ADR 33 (schema isolation).
- **App skills:** `cuadra-web` · `cuadra-mobile` · `cuadra-mobile-forms` · `cuadra-agent-prompts`.
- **Pending:** `docs/pending/save-web-f1-pendientes.md` · `docs/pending/save-alerts-remote-push.md`.
```

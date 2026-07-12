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
  blocking) → Codex judges the grey band → human review queue`. Nothing below the threshold
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
- **F2 (in progress):** **auto-matching ✅ CODE-COMPLETE + ship-dark** (the cascade — its own skill
  `cuadra-save-matching`; flag `SAVE_MATCHING_CASCADE_ENABLED=false`, needs activation). Still to do:
  admin console (Refine, review queue on `list_review_queue`) + PurchasesAgent + receipt OCR
  (Codex vision) / e-CF spike + aggregators (Apify) + RAGAS/LangSmith evals.
- **F3:** multi-country via `store_registry` + financial vertical (`provider.type=bank|insurer`).
- **Known follow-ups:** `docs/pending/save-matching-batch10-y-activacion.md` (turn the matching
  cascade from dark to live + the BGE-M3-vs-Qwen3 spike), `docs/pending/save-web-f1-pendientes.md`
  (SEO leftovers, hardening), `docs/pending/save-alerts-remote-push.md` (remote APNs needs paid Apple).

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

## Commands

```bash
make openapi                              # after any Save DTO/endpoint change → regen api-client
cd apps/api && uv run pytest tests/save   # backend Save suite (unit + integration; needs cuadra-db)
cd apps/api && uv run alembic upgrade head # apply schema `save` migrations to the DB
make save-refresh                         # manual catalog refresh (CLI, no Dagster) — same wiring as the assets
make ingestion-dev                        # Dagster dev (uv sync --group ingestion)
```

## Resources

- **Design source of truth (why):** `docs/research/save-fable/` — 08 = integrated architecture +
  roadmap, 05 = matching, 06 = platform/Dagster, 07 = RAG/agent, 01 = OCR/e-CF, 09 = live endpoint spike.
- **Context:** `docs/research/save-ingesta-fuentes-rd.md` (sources), `docs/research/supermercadosrd-analisis.md`
  (competitor), `docs/arquitectura-mvp.md` §6 (Save) + §12·B (money) + ADR 33 (schema isolation).
- **App skills:** `cuadra-web` · `cuadra-mobile` · `cuadra-mobile-forms` · `cuadra-agent-prompts`.
- **Pending:** `docs/pending/save-web-f1-pendientes.md` · `docs/pending/save-alerts-remote-push.md`.
```

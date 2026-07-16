---
name: cuadra-save-ingestion
description: >
  How to ingest prices from a supermarket in Save — the per-PLATFORM playbook (VTEX / Magento /
  REST_CATALOG) and the per-STORE quirks (Sirena, Nacional, Jumbo, and above all **Bravo**). Owns
  the adapters, the two-loop mechanics (A discovery / B directed coverage), outbound rate limiting,
  barcode normalization (EAN-13 + UPC-A), the LLM switch, and F3.2b recovery. Every rule here was
  measured against the real APIs — the numbers are in the tables. Composes with cuadra-save (domain
  + sacred rules), cuadra-save-matching (the cascade it feeds) and cuadra-api (hexagonal/TDD).
  Trigger: writing, extending, debugging or RUNNING anything under
  `apps/api/src/contexts/save/infrastructure/catalog_sources/`, `apps/api/ingestion/`, or
  `application/{cover_canonicals,refresh_covered_prices,refresh_prices}.py` — a new supermarket, a
  new profile, a 429/rate-limit, a flooded review queue, missing EANs, or a live ingestion run.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Role:** ingestion engineer against THIRD-PARTY APIs you do not control and must not abuse. Two
> failure modes dominate, and both are SILENT: (1) hammering a store until it 429s you, (2) feeding
> garbage into the cascade, which auto-links with **no human review** (a false merge — the named
> worst case, see `cuadra-save-matching`). When in doubt: fetch LESS, and let the barcode go.

## When to Use

- Adding a supermarket, or a `CatalogProfile` for an own-API (REST) súper.
- Touching an adapter, the factory, `ingestion/save/{composition,runner,assets}.py`, or the loops.
- Debugging: a 429, a review queue that exploded, products with no EAN, Loop B doing nothing.
- Running a live ingestion and reading the numbers.

## Critical Patterns

### 1. The capability matrix — MEASURED, not assumed

Search semantics differ per platform. **This table is the whole skill**; everything else follows.

| Store | Platform | `by_ean` | `by_text` | Detail by id | Exposes EAN | Noise per query |
|---|---|---|---|---|---|---|
| Sirena | VTEX | ✅ `ft=` | ✅ `ft=` | productId | **100%** | ~6 — precise |
| Nacional | Magento | ❌ | ✅ `search:` | SKU | ❌ never | ~90 |
| Jumbo | Magento | ❌ | ✅ `search:` | SKU | ❌ never | **~250** 🔥 |
| **Bravo** | REST_CATALOG | ✅ `model.filterByEan` | ✅ `/search?showOrder=score` | `/get?idArticulo` | detail only | top-20 (score) |

- **`by_ean` and `by_text` are INDEPENDENT.** Bravo proved it: its `articulo/list` finds by barcode and
  IGNORES text, while `articulo/search` finds by text. A single `supported` flag CANNOT express a
  barcode-only source, and Loop B would then browse the whole catalog per canonical.
- **✅ Bravo `by_text` is WIRED (unblocked 2026-07-16). Bravo is the ONLY store with `{by_ean, by_text}`.**
  The missing piece was the `showOrder` VALUE: **`score`** (not `importerankingArticulo asc`, the browse
  value, which `/search` REJECTS). `/public/articulo/search?model.filterByIdTienda=…&model.nombreArticulo=…
  &showOrder=score&paginationMaxItems=20` returns FULL products (same shape as `/list`; `associatedEan`
  empty → EAN still harvested from the detail). It is a DIFFERENT endpoint (`/search`, not `/list`) with
  its OWN `showOrder`, so the profile declares `search_path` + `search_extra_params` apart from
  `resource_path`/`extra_params`. This covers the canonicals born from Magento (which NEVER have an EAN →
  were invisible to Bravo's Loop B). **Lesson: the endpoint was never "text-blind" — we were probing the
  wrong endpoint (`/list`) for days.** The user found the value the same way the API always offered it.
- Capability is a property of the **PROFILE**, not the platform: `REST_CATALOG` is a generic adapter
  and each súper decides what it exposes. Domain owns the TYPE (`DirectedCapability`), infra
  computes the VALUE (`factory.directed_capability`). The domain must never learn the word "bravova".
- **How to probe a new store — ASK THE SERVER BEFORE GUESSING.** Bravo's API self-documents through
  its validation errors: calling `/public/articulo/search` with NO params returns
  `{"errors":[{"code":"required","field":"model.nombreArticulo"}, …]}` — it hands you the parameter
  names. 12 guessed names on `list` were wasted effort while the server was willing to tell us.
  For params it does accept, the criterion is NOT "did it answer 200" (APIs ignore unknown params and
  answer 200 anyway) but **"did `totalCount` CHANGE vs baseline"**, using a REAL value harvested from
  that same API (with a fake one you can't tell "param doesn't exist" from "no results").

### 2. Outbound pacing — `round_robin_by_store` does NOT rate-limit

SRD (`scrape-many.ts:11-77`) does **two** things: interleaves stores **and**
`await randomDelay(600,1200)` **between rounds**. We copied the interleaving and left the pause.

**With ONE store the interleaving is a no-op** (`groups={bravo:[p1..pN]}` → same list) and the N
requests fire at CPU speed. `price_refresh` over Bravo is exactly that case → **429, verified live**.

Every loop over network calls needs `pace` (`catalog_sources/pacing.py`, 600-1200ms **with jitter** —
a fixed pause lets parallel runs align and the peak is the same as no pause). It is wired in 4 places:
`refresh_source` (Loop A), `CoverCanonicals`, `RefreshCoveredPrices`, and the REST browse (injected by
the **factory**, so no new caller can forget it).

> **THE LAW:** a safeguard without a **wiring test** does not exist. That is how the pacing was lost
> for months behind a docstring that claimed it prevented rate limits. See
> `test_{freshness,loop_b}_wires_a_real_pace`, `test_factory_always_wires_a_pace_into_the_rest_adapter`.

Cost is real and correct: full Loop A (213 terms × 3 stores) ≈ **11 min**. It used to take seconds
because we were externalizing the cost to the supermarkets' servers.

### 3. Barcodes — the GTIN family: normalize, then filter STRICTLY

`domain/value_objects/ean.py`. Feeds the EAN stage, which auto-links at score 1.0 **with no human review**.

**The app is GLOBAL** (RD → USA → Europe → LatAm), so the domain speaks the whole GTIN family, not
"EAN-13 plus a UPC-A patch":

| Format | Digits | Where |
|---|---|---|
| GTIN-8 | 8 | EAN-8, small products |
| **UPC-E** | 8 | zero-suppressed UPC-A (USA). **Ambiguous with GTIN-8 by length** → disambiguate by number system (0\|1) and validate by EXPANDING it: its check digit is the expanded UPC-A's, not its own |
| GTIN-12 | 12 | UPC-A — USA/Canada |
| GTIN-13 | 13 | EAN-13 — Europe/LatAm/RD |
| GTIN-14 | 14 | case/logistics code (indicator digit 1-8) |

- **Canonical form = GTIN-14, zero-padded** (GS1 right-align + pad). The check digit survives because
  the 3,1,3,1… weights count FROM the check digit leftward — padding zeros can't shift the sum. All four
  ways a store can write the same code converge to ONE string, so the EAN stage compares strings.
  A GTIN-14 with indicator 1-8 is a CASE (another SKU, own check digit) → stays a distinct string, which
  is correct: a case is not a jar.
- **Normalizing is not cosmetic**: if Bravo writes `760593023182` and Sirena `0760593023182` and they
  don't converge, the EAN stage NEVER links them — an INVISIBLE false negative. **Measured 2026-07-16,
  not theoretical: 33/63 rows with EAN (52%) violated the invariant**, and it was faking 2 "legitimately
  new products" in the review queue.
- **Restricted ranges** over the GTIN-13 view: `200-299`, **`020-029`**, **`040-049`** (UPC-A number
  systems 2 = variable weight — the barcode encodes the WEIGHT, not the product — and 4 = local use; a
  filter that only checks `2x` lets them through disguised), plus **GTIN-8 leading `0`\|`2`**, plus
  coupons/refunds `980-984` and `990-999`. **ISBN/ISSN (`977`/`978`/`979`) are ACCEPTED**: books and
  magazines are global product identifiers a súper does sell.
- **The zero-eaten UPC-A**: an 11-digit code is no barcode at all — it's a UPC-A whose leading zero a
  NUMERIC parse upstream ate. Restore it and validate. Evidence it's real (Sirena, 11 rows): 11/11 pass
  checksum (chance = 10⁻¹¹) **and the prefix matches the brand in the name** (41331=Goya, 0039978=Bob's
  Red Mill, 0070560=Pictsweet).
- **EVERY adapter writes through `pick_global_ean`** — VTEX did NOT until 2026-07-16 (`ean=first.get("ean")`,
  raw), and since **Sirena is THE SEEDER** (R7), the unguarded path contaminated the one source everything
  else depends on. A backfill without fixing the write path undoes itself on the next run.
- **The filter runs on the RAW form, never on a stored one.** A restricted GTIN-8 padded to GTIN-14
  (`00000021061684`) is indistinguishable from a global UPC-A — the format is gone. So the filter lives at
  the WRITE boundary (`pick_global_ean`), decides while the format is still visible, and what's stored is
  already filtered.
- **NEVER take `associatedEan[0]`**: the list mixes global, internal and PLU codes, and the global one
  is NOT first. Use `pick_global_ean`. `None` is a healthy, expected outcome — the cascade then goes
  by name/vector, which HAS a human safety net.

### 4. Magento's search is fuzzy — cap it (top-20, measured)

`products(search:)` **ORs the tokens**: `"habichuelas rojas la famosa"` → **704** products, and from
rank 3 they are AIR FRESHENERS (they match on "rojos"). **The more words in the term, the more garbage.**
Draining to `total_pages` was the real queue flooder (**1502** new products from 8 terms on Jumbo).

`MAGENTO_MAX_RESULTS = 20` comes from measuring the position of the LAST relevant hit, not from intuition:

| term | last relevant at |
|---|---|
| arroz la garza · aceite mazola | 7 |
| arroz integral | 8 |
| **azucar crema** | **12** — positions NOT contiguous |
| **leche evaporada** | **15** |

top-10 would have LOST 5 real matches. **top-20 keeps 100% and drops ~97% of the noise.** Live result:
Jumbo 2006→**160** seen, 1502→**87** new, 316s→**90s**. Does NOT apply to VTEX (`ft=` is precise).

### 5. Bravo (REST_CATALOG) — the full playbook

Only súper with its own REST API. Everything specific lives in `bravova_profile.py`; the adapter is generic.

| Fact | Consequence |
|---|---|
| `articulo/list` **ignores all text search** (it is the browse endpoint) | Loop A = browse by section (41 sections) |
| **`articulo/search`** searches by `model.nombreArticulo` with **`showOrder=score`** (the value `/list` never took) | Loop B by TEXT ✅ — covers no-EAN canonicals. Own endpoint + `search_extra_params` in the profile |
| `list` accepts **`model.filterByEan`** → exact, **GLOBAL** (no section needed), 1 request | Loop B by EAN ✅ + deterministic recovery ✅ |
| `list.associatedEan` **always empty** (0/200) | the browse yields NO barcode |
| `articulo/get` **does** return `associatedEan` + `marcaArticulo` | `price_refresh` harvests EAN for FREE (it already calls `/get`) |
| `/get` id is **`idArticulo`**, not the `idexterno` that IS the `external_id` | lives in `store_product.source_ref` |
| `/get` is gated by token **AND** the `Domicilio/…` User-Agent | token-only ⇒ 403. UA is in `profile.default_headers` (code), token in `store_registry.auth` (admin) |
| Rejects any request without `showOrder` | browse → `profile.extra_params` (`importerankingArticulo asc`); search → `search_extra_params` (`score`) |
| Rate-limits `/get` under load | 429 → BACKEND_DOWN → abort-on-down |
| `store_id: 1000` | same preferred store SRD uses (`idTiendaArticuloTienda === 1000`) |

**Cuadra beats SRD here**: their `RecoverableShopId` is `1|2|3|4` — Bravo is 6, so a broken locator is
LOST for them. With `filterByEan` (global, no section) we re-find it deterministically.

### 6. The LLM is a knob, not a dependency

`SAVE_LLM_JUDGE_ENABLED` (**default `false`** — quota decision 2026-07-15). With it off, **no judge object
is built**, so the circuit-breaker cannot even participate. The DETERMINISTIC cascade is untouched: exact
EAN, high band and lexicon still resolve for free. **Measured: 85% auto-linked with the LLM OFF.**

- Grey band with no judge → matcher: review with **`method="human"`** (NOT `"llm"` — the judge never ran;
  saying otherwise lies in the exact distinction CRITICAL-1 defends). Classifier: unclassified, `method="none"`.
- **FIXED 2026-07-16** (was a latent bug): with the breaker OPEN, `LlmJudge` returned `_UNCERTAIN`
  **without calling the API** and it was recorded as `method="llm"`. Measured: of 11 `pending_review/llm`,
  **the LLM never saw 8**. Now `JudgeVerdict.degraded` marks every fail-safe verdict (open breaker /
  client failure / unreadable output) and the use-case records `human`; a REAL `uncertain` from the judge
  stays `llm`. The flag rides on the verdict because only the adapter knows whether the API ever spoke.
  See `cuadra-save-matching` §7bis.

## Code Examples

```python
# Capability: domain owns the TYPE, infra computes the VALUE (never `platform is X` in the use-case)
cap = self._capability_of(source)                    # injected, like build_adapter/classify_error
if not cap.supported:            continue            # browse-only → Loop A
query = build_directed_query(..., store_supports_ean=cap.by_ean)
if not query.by_ean and not cap.by_text: continue    # ← the gate: no barcode + text-blind ⇒ full browse

# Barcode: EVERY adapter writes through this. Normalizes to GTIN-14, filters restricted. Never [0].
pick_global_ean(["33334", "760593023182"])           # → "00760593023182"  (UPC-A → GTIN-14)
pick_global_ean(["41331026123"])                     # → "00041331026123"  (zero-eaten UPC-A, rescued)
pick_global_ean(["21061684"])                        # → None (valid GTIN-8, but prefix 2 = in-store)

# Late lookup: `def f(*, sleep=time.sleep)` FREEZES the ref at import → monkeypatch is ignored and
# the test SLEEPS FOR REAL, silently. Resolve inside the closure.
(sleep or time.sleep)(random.uniform(min_ms, max_ms) / 1000.0)
```

## Commands

```bash
cd apps/api && uv run pytest tests/save tests/ingestion -q     # 712 green, ~10s (must NOT sleep)
cd apps/api && uv run python -m seeds.save_inspect             # per-provider snapshot
cd apps/api && uv run python -m seeds.save_clean --ingestion   # dry-run; --yes to execute
# Live run (cascade ships dark; the LLM stays off by default):
cd apps/api && SAVE_MATCHING_CASCADE_ENABLED=true uv run python -m seeds.save_refresh
# DB: psql is NOT on PATH. Use the app session (module is src.shared.db.base):
cd apps/api && uv run python -c "from src.shared.db.base import SessionLocal; ..."   # tables live in schema `save.`
```

## Live baseline (2026-07-15 — clean DB, full stack)

> ⚠️ **This baseline is PESSIMISTIC and must be RE-MEASURED in F2** (correction 2026-07-16). It was taken
> while Sirena's EANs were unnormalized, so part of that 15% queue was the invisible false-negative, not
> genuine ambiguity — two of the queued items turned out to be the SAME product Sirena had already
> auto-linked, split only by a zero. The EAN backfill alone made **10 barcodes cross Bravo↔Sirena** that
> previously could not converge. Re-measure before tuning anything on these numbers.

| Metric | Value |
|---|---|
| Auto-linked **with the LLM off** | **85%** (80/94) |
| To the human queue | 15% |
| Bravo barcode coverage after harvest | **100%** (10/10) |
| Matches with `method='llm'` | **0** ✓ |
| Rate-limits in ~500s over 3 stores | **0** ✓ |
| Loop B: pairs / aborted | 100 / **0** |

Same stack WITHOUT the Magento cap: **5%** auto-linked, ~2000 queue items. The queue problem was never
the judge — it was the fuzzy query.

## Resources

- **SDD (why):** `docs/sdd/save-ingesta-dos-loops.md` · **SRD teardown:** `docs/research/supermercadosrd-scrapers-teardown-y-plan-cuadra.md`
- **SRD source (read it — it has been right 3×):** `/Users/ismartz/Desktop/DEV/supermercadosrd-scrapers-main`
  — `scrape-many.ts` (the pacing we half-copied), `nacional-catalog/` (**sitemap** discovery),
  `sirena-catalog/` (category tree), `recovery/` (proposal + `evidence`, never auto-applied).
- **Composes with:** `cuadra-save` (domain + sacred rules) · `cuadra-save-matching` (the cascade this feeds)
  · `cuadra-save-admin` (sources console) · `cuadra-api` (hexagonal/TDD/Alembic).

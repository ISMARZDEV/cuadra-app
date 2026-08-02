---
name: cuadra-save-matching
description: >
  The BUILT matching subsystem of Save (F2.0, code-complete + ship-dark) — the deterministic
  cascade that decides whether an ingested store_product links to an existing canonical_product or
  goes to a human review queue: EAN → pg_trgm → pgvector(BGE-M3) → RRF → Claude-judge → queue. Owns
  the hard-won internals + gotchas: RRF is for candidate CONSENSUS (not the banded score), the judge
  confidence FLOOR, the same-transaction FK invariant (product_match is the single source of truth),
  the ship-dark feature flag + ingestion composition root, the one-embedding-model-per-index rule,
  and the pgvector/pg_trgm/HNSW query patterns. Composes with cuadra-save (domain) + cuadra-api
  (backend). Trigger: building, extending, ACTIVATING, tuning, or debugging anything under
  apps/api/src/contexts/save/infrastructure/matching/ or application/match_store_product.py — a new
  cascade stage, threshold tuning, the review queue / admin console on top of it, the embedding
  provider, the Claude judge, or turning the SAVE_MATCHING_CASCADE_ENABLED flag on.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Role:** entity-resolution + pgvector engineer. Save is fintech — a FALSE MERGE (two distinct SKUs
> unified) is the named worst-case: it corrupts every comparison built on it. When a shortcut would
> let a low-confidence signal auto-merge, you STOP. Deterministic scoring decides; the LLM only
> classifies the grey band and NEVER emits a price. Composes with `cuadra-save` (the 4 SACRED rules,
> the domain) and `cuadra-api` (hexagonal/TDD/Alembic). This skill owns the matching INTERNALS.

## When to Use

- Editing/extending the cascade in `apps/api/src/contexts/save/infrastructure/matching/` or the
  use-case `application/match_store_product.py`.
- Tuning thresholds, adding a cascade stage, swapping the embedding model, or the Claude judge.
- Building on the review queue (e.g. the admin console — F2 milestone B1) via `list_review_queue`.
- ACTIVATING the cascade (it ships dark) — see `docs/pending/save-matching-batch10-y-activacion.md`.

## What's built + where (F2.0, code-complete, ship-dark)

| Piece | Path |
|---|---|
| Use-case (orchestrates the cascade) | `contexts/save/application/match_store_product.py` |
| Re-evaluate rows ALREADY queued (gotcha #10) | `contexts/save/application/rematch_pending.py` · `domain/rematch.py` |
| Pure scoring (RRF / boosts / banding) | `contexts/save/infrastructure/matching/cascade/{fusion,scoring,banding}.py` |
| Repo (pgvector/trgm queries + review queue) | `contexts/save/infrastructure/matching/repository/product_match_repository.py` |
| Embedding adapter (BGE-M3, injectable client) | `contexts/save/infrastructure/matching/embeddings.py` |
| LLM judge (fail-safe, structured output) | `contexts/save/infrastructure/matching/llm_judge.py` |
| Entity + ports | `domain/entities/product_match.py` · `domain/ports/repositories.py` |
| Ingestion wiring + flag gate | `application/refresh_prices.py` · `ingestion/save/composition.py` |
| Migration (extensions + product_match + HNSW) | `migrations/versions/614e370d452c_*.py` |
| Full plan + evidence | `docs/sdd/save-matching/plan.md` · aispace-men `sdd/save-matching/*` |

## The cascade contract (cheapest → most expensive)

The incoming EAN must arrive **NORMALIZED to GTIN-14** (`pick_global_ean`, skill
`cuadra-save-ingestion`): a UPC-A `760593023182` and its EAN-13 form `0760593023182` are the SAME
barcode, and if two stores do not converge on the same string this stage NEVER links them — an
INVISIBLE false negative (it just looks like "no match"). **Not theoretical: measured 2026-07-16, it
was 52% of the rows carrying an EAN** (Sirena wrote them raw) and explained 2 of the products the
queue reported as "legitimately new". Every adapter writes through `pick_global_ean` — the filter runs
on the RAW form, never on an already-stored one.

```
exact EAN (score 1.0) ──┬─ 1 match  → auto_link (method=ean)
                        ├─ 0 match  → falls through to lexical
                        └─ >1 distinct canonical → COLLISION → review queue (NO auto-link)
pg_trgm (lexical) + pgvector/BGE-M3 (semantic) → RRF (consensus) → brand/size boosts → banding:
    score ≥ HIGH (0.85)                          → auto_link (method=hybrid|trgm|vector)
    MID [0.55, 0.85)                             → Claude judge (grey band)
    < MID  or  no candidates                     → review queue (method=human)
Claude judge {decision, confidence, cited_fields}:
    match AND confidence ≥ JUDGE_MATCH_MIN_CONFIDENCE (0.70) → auto_link (method=llm)
    match but confidence < 0.70 (WEAK match)                 → review queue (method=llm)
    no_match / uncertain / schema-fail / timeout             → review queue
```

## Critical Patterns (the gotchas — do NOT relearn these the hard way)

1. **RRF is for candidate CONSENSUS, never the banded score.** With `DEFAULT_RRF_K=60` the fused RRF
   sum maxes at ≈0.033 — it can NEVER reach `MATCH_MID_THRESHOLD=0.55`. RRF only picks the winning
   candidate by cross-stage rank consensus; the **winner's raw per-stage similarity [0,1]** (trgm
   `similarity()` / vector `1 - cosine_distance`) is what feeds `apply_boosts` → `determine_band`.
2. **Judge confidence FLOOR.** A judge `match` auto-links ONLY if `confidence ≥ JUDGE_MATCH_MIN_CONFIDENCE`
   (0.70, in `banding.py`, tunable). A weak match → review queue. This is SACRED rule #4 in code.
3. **`product_match` is the SINGLE source of truth for linkage.** `store_product.canonical_product_id`
   is a denormalized pointer written ONLY inside the same transaction as its `product_match` row —
   the **use-case owns the transaction boundary** (`link_to_canonical` + `record_match` on one Session;
   no DB trigger). Never write the FK any other way, or the two representations drift.
4. **Ship-dark.** `SAVE_MATCHING_CASCADE_ENABLED` defaults `False`. The refresh's composition root is
   **`ingestion/save/composition.py::build_matcher`** (returns `None` when off) — NOT the FastAPI
   `composition_root.py` (that's API DI, it does NOT wire the refresh). `RefreshCatalogPrices(matcher=None)`
   preserves the legacy drop-unmatched behavior.
5. **One embedding model per index.** Vectors from different models are NOT comparable. Swapping the
   model = a FULL catalog re-embed of `canonical_product.embedding` + HNSW reindex via a NEW migration,
   never a config flip. That's why `EmbeddingProvider` is a port and embeddings are computed at
   ingestion write-time, not per-request.
6. **The Anthropic client lives ONLY in `infrastructure/matching/`** (`claude_judge.py`, via
   `shared.llm.get_chat_model` — not the raw SDK). import-linter `domain-puro` FAILS if it leaks into
   domain. The judge is consumed by the use-case via a LOCAL `Protocol` (`GreyBandJudge`), not a domain port.
7bis. **`method="llm"` ⟺ the judge emitted a VALID verdict** (FIXED 2026-07-16). With the breaker open,
   `LlmJudge` returned `_UNCERTAIN` **without calling the API**, and the use-case recorded it as
   `method="llm"`. Measured 2026-07-15: of 11 `pending_review/llm` rows, **the LLM never saw 8** — so you
   would read the queue and "tune the judge" against a signal it never emitted.
   **The fix:** `JudgeVerdict.degraded` separates *"the judge was unsure"* (a legitimate signal of its
   own → `llm`) from *"the judge was not there"* (open breaker / API down / unreadable output →
   `human`). The flag rides on the VERDICT and not on the use-case because **only the adapter knows
   whether the API ever spoke**. All three degraded paths return `uncertain`, so `decision` alone
   cannot tell them apart — hence the flag, and hence a REAL `uncertain` from the judge stays `llm`.
   Note: a degraded verdict may still carry tokens (the call was paid for and came back unreadable).
   Not a contradiction — it is the honest reading of "we paid and got nothing trustworthy".

7. **Judge fail-safe.** Any invalid/unparseable/out-of-range/timeout judge output is forced to
   `uncertain` → review queue. It re-validates the payload (`_Verdict.model_validate`) — never trusts
   the LLM parse alone. Never risk a false merge on a judge error. Token usage is logged per call.

8. **The EAN stage needs a COUNTERPART — it does NOT compare against the canonical** (measured
   2026-08-02). `canonical_product` **has no `ean` column at all**. `find_candidates_by_ean` looks for
   **another `store_product` carrying the same EAN that is ALREADY linked**
   (`product_match_repository.py:160-177`), filtered by `provider.market_id` — store-agnostic, so any
   provider in the market can act as the bridge. With no counterpart the stage CANNOT fire, no matter
   how good the incoming barcode is.
   **The corollary changes how you value EAN harvesting:** creating canonicals from one store's own
   products does **NOT** create bridges for that **same** store's other products (each has a unique
   EAN). The bridge appears when **another** store ingests the same product. Harvesting EAN is an
   **INVESTMENT**, not a retroactive fix. Measured on Bravo: 32 EANs harvested, only 4 with a
   counterpart (already linked) → re-matching 46 rows linked **1**. That was not a matcher bug.
   Per-platform coverage + the open investigation: `docs/pending/save-ean-por-plataforma.md`.

9. **With no embedder the vector stage is SKIPPED — never fed a fabricated vector.**
   `MatchStoreProduct(embedding_provider=...)` accepts `None` (the API does not always carry a model:
   `build_api_embedder` resolves HTTP endpoint → in-process model → `None`). A zero/fake vector is
   **not "no signal"**: `find_candidates_vector` would return arbitrary neighbours that RRF then fuses
   as legitimate candidates. With `None`, `vector_candidates = []` and the reported `method` says
   `trgm` — it does not lie about which stage ran. Pinned by test.

10. **Review-queue candidates are STATIC unless something re-evaluates them.**
    `RefreshCatalogPrices` only routes **UNKNOWN** `store_product`s to the matcher
    (`exists(provider_id, external_id)`), so a `pending_review` row is **NEVER re-evaluated**: it drags
    the candidates of the day it arrived, even if the right canonical has existed for weeks. The way
    out is `RematchPending` (`application/rematch_pending.py`) →
    `POST /v1/admin/save/review-queue/bulk-rematch` → the "Re-evaluate selected" bulk action in the
    queue. Idempotent (`record_match` upserts, `record_candidates` REPLACES the set).
    - The repo returns `RematchableProduct` (**domain**, `domain/rematch.py`) and the use-case converts
      to `IncomingStoreProduct`: **`infrastructure` NEVER imports from `application`** in this context.
    - A re-evaluation does **not** stamp `run_id`: it is not an ingestion-run finding, and attributing
      it would falsify that run's funnel.
    - **EAN-stage testbed:** return to the queue products whose EAN DOES have a counterpart, then
      re-evaluate. Result 2026-08-02: **4/4 by `ean` at 100%**, and 3 of them had been linked by
      `trgm`/`llm` — the deterministic signal beats the probabilistic ones, exactly as the cascade
      promises.
      ⚠️ Use **`UnlinkStoreProduct`**, NEVER bare `reopen_review`: the latter clears the canonical on
      the *match* but leaves `store_product.canonical_product_id` set — and the EAN stage reads **that**
      field, so the product becomes its OWN bridge and the test yields a **false green**.

## Code Examples

```python
# pgvector ANN (uses the HNSW index) — ORM-mapped Vector(1024), NOT raw SQL
select(CanonicalProductModel.canonical_product_id)\
    .order_by(CanonicalProductModel.embedding.cosine_distance(embedding)).limit(limit)
# pg_trgm (uses the GIN index)
.where(CanonicalProductModel.name.op("%")(name)).order_by(func.similarity(...).desc())
# Alembic: extensions/HNSW are hand-edited (autogenerate can't see them) — mirror 614e370d452c
op.execute("CREATE EXTENSION IF NOT EXISTS vector")
op.execute("CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=100)")
```

## Extending it

- **New stage:** add a `find_candidates_*` to `ProductMatchRepository` (port + SQL impl), feed its
  ranked list into `reciprocal_rank_fusion(...)`, keep the banded score on the raw [0,1] scale.
- **Tune thresholds:** `HIGH`/`MID`/`JUDGE_MATCH_MIN_CONFIDENCE` in `cascade/banding.py` — tune with
  real labeled data (Batch 10 spike), not by guessing. All are named constants for this reason.
- **Admin console (B1):** build on `ProductMatchRepository.list_review_queue(market_id)` +
  `resolve_review(match_id, canonical_product_id, decided_by)`. Role-gated (RBAC exists). No new
  matching logic needed — the queue + resolve are already there.
- **Activate:** deploy a BGE-M3 endpoint → `SAVE_BGE_M3_ENDPOINT_URL` → flag ON in staging → run
  ingestion → review the queue → tune → flag in prod. Full sequence in the pending doc.

## Decisions (re-benchmark before overriding)

- **Hand-rolled cascade** chosen over Splink (over-engineering for the ~200-SKU bootstrap; revisit at
  scale) and GoldenMatch (rejected: immature, single-maintainer, self-reported benchmarks).
- **BGE-M3** chosen over Qwen3-Embedding-0.6B (no head-to-head grocery/Spanish benchmark existed;
  offline spike deferred, non-blocking). Deterministic scoring > LLM generation for the DECISION.

## Commands

```bash
cd apps/api && uv run pytest tests/save tests/ingestion -q   # matching suite (needs make db-up)
cd apps/api && uv run alembic upgrade head                    # apply the pgvector/product_match migration
cd apps/api && uv run lint-imports                            # domain-puro must stay KEPT
make save-refresh                                             # CLI refresh; wires build_matcher (flag-gated)
```

## Resources

- **Plan (SDD, full):** `docs/sdd/save-matching/plan.md`
- **Activation + Batch 10 spike (how to turn it on):** `docs/pending/save-matching-batch10-y-activacion.md`
- **Design source of truth (why):** `docs/research/save-fable/05-pilar3-matching-agregadores.md`
- **Composes with:** `cuadra-save` (domain + sacred rules) · **`cuadra-save-ingestion`** (what FEEDS this
  cascade: adapters, per-store barcode quirks, EAN normalization, the Magento noise cap) · `cuadra-api`

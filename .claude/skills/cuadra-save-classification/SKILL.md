---
name: cuadra-save-classification
description: >
  The BUILT category classifier of Save — the deterministic cascade that assigns each product
  (store_product / canonical_product) a taxonomy leaf, or leaves it UNCLASSIFIED (never invents a
  category). Cascade: source×name cross-check → lexicon → pgvector(BGE-M3) with a MARGIN band →
  optional LLM judge. Owns the hard-won, MEASURED internals: why the category embedding recipe uses
  domain example terms (top-1 43%→77%), why the classifier drops trgm/RRF (it contaminates category
  retrieval: 17% precision), why the band is by vector MARGIN not an absolute score (the matching's
  0.85 is unreachable here), the "change the input → invalidate the embedding" re-embed invariant,
  and the offline-terms generation (LLM + curated bootstrap). Composes with cuadra-save (domain) +
  cuadra-save-matching (its sibling cascade — do NOT confuse the two judges/bands) + cuadra-api.
  Trigger: building, tuning, ACTIVATING, or debugging anything under
  contexts/save/infrastructure/classification/ or application/{classify_store_product,
  generate_category_terms,embed_categories}.py — a cascade stage, the taxonomy terms, the margin
  threshold, the category judge, the relevance gate R2 on top of it, or turning
  SAVE_CLASSIFICATION_ENABLED on.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Your role:** a data/ML engineer with 15+ years in entity resolution + text classification who
> treats "the AI never invents a fact" as sacred. Category is a UI need (the category pages, F5), NOT
> the price comparator — the market leader (SupermercadosRD) ships a comparator with NO category
> column at all. So the bar is: **auto-classify only what is CLEARLY right; leave the rest
> unclassified for human curation.** Precision over recall. When a shortcut would let a low-confidence
> guess become a stored category, you STOP.

> **Every number in this skill was MEASURED** (120 taxonomy leaves × 30 real products, DO market,
> BGE-M3). Before overriding a threshold or a design choice here, reproduce the measurement — do not
> "improve" it from intuition. This whole subsystem exists because the previous design *looked* right
> and was wrong (the recipe docstring literally claimed it disambiguated; it did the opposite).

## When to Use

- Anything under `apps/api/src/contexts/save/infrastructure/classification/`.
- The use-cases `application/{classify_store_product,generate_category_terms,embed_categories}.py`.
- Tuning the margin threshold, the category embedding recipe, or the taxonomy `classification_terms`.
- The relevance gate **R2** (`infrastructure/classification/relevance_gate.py`) — it calls
  `ClassifyStoreProduct.decide()` to drop out-of-footprint noise before the queue.
- Turning the classifier on in ingestion (`SAVE_CLASSIFICATION_ENABLED`) or wiring its LLM judge.

## What's built + where (code-complete, ship-dark)

| Piece | Path | Role |
|---|---|---|
| Cascade use-case | `application/classify_store_product.py` | `ClassifyStoreProduct` — `.execute()` (persists) / `.decide()` (pure, for R2) |
| Embedding recipe | `infrastructure/classification/category_embedding_text.py` | `build_category_embedding_text(name, parent, terms=None)` |
| Vector-margin band | `infrastructure/classification/category_banding.py` | `decide_by_vector_margin(...)` — the classifier's OWN band |
| Lexicon (stage 1) | `infrastructure/classification/lexicon.py` | token→leaf, high precision, drops ambiguous tokens |
| Index backfill | `application/embed_categories.py` | `EmbedCategories` — embeds leaves with NULL embedding |
| Terms generation | `application/generate_category_terms.py` + `infrastructure/classification/llm_category_terms.py` | offline LLM enrichment (fail-safe) |
| Curated bootstrap | `seeds/category_terms_data.py` | `CATEGORY_TERMS` (120 hand-validated) + `seed_category_terms` |
| Category judge | `infrastructure/classification/category_judge.py` | grey-band arbiter, gated by `SAVE_LLM_JUDGE_ENABLED` (OFF) |
| Composition | `ingestion/save/composition.py::build_classifier` | gated by `SAVE_CLASSIFICATION_ENABLED` (ship-dark) |

## The cascade contract (cheapest → safest; the classifier's own, NOT the matcher's)

```
_decide(product):                     # Stage B — cross TWO independent signals
  source_hit = lexicon_match_path(source_category)     # the store's OWN category
  by_name    = _classify_by_name(product)              # the name cascade (below)
  ├─ source AND name agree      → auto (source_name, 0.97)
  ├─ source AND name CONFLICT   → UNCLASSIFIED (conflict)   # two strong signals disagree → human
  ├─ source only                → auto (source, 0.90)
  └─ name only                  → by_name

_classify_by_name(product):           # NO trgm / NO RRF here (measured: it contaminates)
  1. lexicon_match(name)              → auto (lexicon, 0.95)         ← literal token hit, ends here
  2. vector = find_leaves_vector(embed(name))                       ← BGE-M3, terms-enriched index
     winner, score, band = decide_by_vector_margin(vector)         ← MARGIN top1−top2 ≥ 0.03
       ├─ auto_link  → auto (vector, score)
       ├─ grey       → judge if SAVE_LLM_JUDGE_ENABLED else UNCLASSIFIED   # no judge = do not invent
       └─ human      → UNCLASSIFIED (no candidates)
```

## Critical Patterns (the gotchas — every one MEASURED, do NOT relearn)

1. **The embedding recipe MUST carry domain example terms.** `"{parent} {leaf}"` ("Bebidas Agua") is
   a short label — BGE-M3 dense leaves all 120 categories crammed at cosine ~0.40–0.48 and the winner
   is near-random ("Habichuelas"→"Agua", rank 36/120). `"{parent} > {leaf}. Ejemplos: {terms}"` →
   **top-1 43%→77%**. Terms live in `taxonomy_node.classification_terms` (curable DATA, not code).
2. **The classifier drops trgm/RRF — do NOT add them back.** The matching cascade fuses trgm+vector by
   RRF; the classifier does NOT. Category trgm compares the product name against the LEAF NAME (which
   does not carry the terms) → noise. Measured on the fuzzy stage: **RRF 17% precision, solo-vector
   67%, margin-vector 100%.** The literal-token hits trgm would add are already covered by the LEXICON.
3. **Band by MARGIN, not absolute score.** The matcher's `MATCH_HIGH=0.85` is UNREACHABLE here (hits
   live in 0.41–0.61) AND hits overlap with misses → an absolute threshold separates nothing. The
   vector **margin** (top1−top2 ≥ `CATEGORY_MARGIN_THRESHOLD=0.03`) does. This is `category_banding`,
   deliberately SEPARATE from `matching/cascade/banding.py`. Do not reuse `determine_band` for category.
4. **Change the input → invalidate the embedding.** `set_terms` sets `classification_terms` AND
   `embedding=NULL` in the same write, so `EmbedCategories` (idempotent over NULL) re-embeds with the
   new recipe. No "dirty" flag. If you ever hand-edit terms via SQL, NULL the embedding too or the
   index goes stale silently (a "lies-in-green" bug).
5. **Two different judges — do NOT confuse them.** `CategoryJudge` (grey band of THIS cascade, almost
   empty) ≠ the matching `LlmJudge` (the 67% grey queue that moves auto-link 36%→~65%). Both gated by
   the SAME `SAVE_LLM_JUDGE_ENABLED` (OFF, quota). A judge canNOT fix a broken retrieval — it only
   re-asks about the vector's top-1 candidate.
6. **Never invent a category (sacred).** Grey with no judge, conflict, low margin, sub-floor judge
   verdict → all leave the product UNCLASSIFIED. Persist ONLY a confident leaf. This is why precision
   (92% measured) matters more than recall (73%) — an unclassified product is honest; a wrong one lies.
7. **The judge, if ever ON, judges the VECTOR top-1** (`vector[0].name`), not an RRF winner (there is
   none). `JUDGE_MATCH_MIN_CONFIDENCE=0.70` floor still applies (borrowed from matching banding).

## Code Examples

```python
# Build + run (dark unless the flag is on). juez=None → grey band never classifies.
classifier = build_classifier(session)          # None if SAVE_CLASSIFICATION_ENABLED is off
result = classifier.decide(product, market_id)  # pure: no persistence (this is what R2 calls)
result = classifier.execute(product, market_id) # persists a confident leaf; idempotent per ref_id

# The measured recipe (terms present → descriptive; absent → measured fallback)
build_category_embedding_text("Arroz, Granos & Legumbres", "Despensa & Abarrotes",
                              terms="arroz, habichuelas, guandules")
# → "Despensa & Abarrotes > Arroz, Granos & Legumbres. Ejemplos: arroz, habichuelas, guandules"
```

## Extending it

- **A new taxonomy leaf** → it starts with NULL terms → falls back to `"{parent} {leaf}"` (~43%).
  Seed terms (bootstrap or LLM) then re-embed. Never leave a leaf termless in production.
- **Regenerate terms** → `seeds.generate_category_terms` (LLM, `--no-embed` to defer). Bootstrap
  first (`seed_category_terms`, deterministic, zero quota) for immediate arrival.
- **Tune the margin** → `CATEGORY_MARGIN_THRESHOLD` is provisional (12 fuzzy cases). Re-measure with a
  labeled basket before moving it; raising it trades recall for precision, lowering it risks a wrong
  auto-classify (habichuelas→Agua territory).
- **Known follow-up (lexicon, not the band):** literal tokens that are ALSO category names misfire —
  "Detergente Ace **Polvo**"→Bebidas En Polvo, "Atún en **Agua**"→Agua. The 2 measured errors are here,
  not in the vector band (which had 0). Fix belongs in `lexicon.py` (ambiguous-token handling).

## Decisions (re-benchmark before overriding)

| Decision | Why | Evidence |
|---|---|---|
| Descriptive recipe with terms | short labels don't discriminate | top-1 43%→77% |
| No trgm/RRF in the classifier | category trgm sees leaf name, not terms | RRF 17% vs margin 100% precision |
| Margin band, not absolute score | hits 0.41–0.61 overlap misses; 0.85 unreachable | measured spread |
| Judge OFF, grey = unclassified | quota + a judge can't fix retrieval | product decision |
| Bootstrap terms over live LLM | deterministic, zero quota, already 77% | validated 120/120 leaves |

## Commands

```bash
cd apps/api
uv run pytest tests/save/unit/test_{classify_store_product,category_banding,category_embedding_text,generate_category_terms,llm_category_terms}.py
uv run pytest tests/save/integration/test_{category_candidate_repository,seed_category_terms}.py
# Seed curated terms (idempotent, no quota) then re-embed the category index:
uv run python -c "from seeds.category_terms_data import seed_category_terms; from src.shared.db.base import SessionLocal; \
  s=SessionLocal(); print(seed_category_terms(s,'DO')); s.commit()"
# Or generate terms with the LLM (quota), then re-embed:
uv run python -m seeds.generate_category_terms            # --no-embed to defer, --market DO
# See it live on a source (needs SAVE_CLASSIFICATION_ENABLED=true):
SAVE_CLASSIFICATION_ENABLED=true uv run python -m seeds.classify_live --source sirena --queries 12
```

## Resources

- **Sibling cascade:** `cuadra-save-matching` (product↔product; the OTHER judge/band — keep them distinct).
- **Domain + sacred rules:** `cuadra-save`. **Backend conventions + TDD:** `cuadra-api`.
- **Spec:** `docs/sdd/save-category-classification.md`. **Competitor context (no category column):**
  `docs/research/supermercadosrd-analisis.md`.
```

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
  version: "1.2"
---

> **Your role:** a data/ML engineer with 15+ years in entity resolution + text classification who
> treats "the AI never invents a fact" as sacred. Category is a UI need (the category pages, F5), NOT
> the price comparator — the market leader (SupermercadosRD) ships a comparator with NO category
> column at all. So the bar is: **auto-classify only what is CLEARLY right; leave the rest
> unclassified for human curation.** Precision over recall. When a shortcut would let a low-confidence
> guess become a stored category, you STOP.

> **Every number in this skill was MEASURED** — the 43%→77% recipe on 120 leaves × 30 real products
> (DO, BGE-M3), and the 2026-08-04 index audit on 588 term-probes over the current 134 leaves.
> Before overriding a threshold or a design choice here, reproduce the measurement — do not
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
| Curated bootstrap | `seeds/category_terms_data.py` | `CATEGORY_TERMS` (134, keyed by node **KEY**) + `ROOT_TERMS` (17, inert — see §13) + `seed_category_terms` / `seed_root_terms`, both called from `seed_save` |
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
8. **A category-word that is also a common INGREDIENT anchors the lexicon and misclassifies**
   (measured 2026-08-02 on Bravo). This is **instance #1 of the discrimination doctrine** — the same
   defect later hit the router (`compr`) and the basket resolution. Read **`cuadra-save` §1b** for
   the doctrine and, above all, for why raising a threshold never fixes it. Same failure family as
   `polvo`/`agua`, but worse because the token dominates the name. Every one of these landed in
   *Arroz, Granos & Legumbres*:

   | Product | Truth | Anchoring token |
   |---|---|---|
   | `NATRUE BEBIDA ARROZ 32 OZ` | a plant-based **drink** | `arroz` |
   | `LA RIBERA MORCILLA DE ARROZ` | a **cured sausage** | `arroz` |
   | `PB ARROZ BLANCO` · `ARROZ CON MAIZ (PB)` | prepared **meals** | `arroz` |

   It also splits product LINES: `FRESCAN POLLO Y ARROZ` → *Pollo* while `FRESCAN RES Y ARROZ` →
   *Granos* — same line, two categories.
   **Why it is expensive, not cosmetic:** the canonical's category feeds the matcher's category
   gate/boost (`cuadra-save-matching`), so a mis-categorised canonical silently biases FUTURE links.
   And a canonical is hard to undo — archive only. **Vet categories BEFORE bulk-creating canonicals
   from queue rows**; hold back the doubtful ones rather than seeding the catalog with them.
9. **The taxonomy is exactly TWO levels — 17 roots (level 0) + 134 leaves (level 1).** *(Corrected
   2026-08-04. This entry used to claim three levels; that was true of the DB, never of the design.)*
   The deeper nodes it described (`Arroz`, `Granos`, `Legumbres`, `Protector Solar` and four
   grandchildren) were **demo scaffolding**: `seeds/save_seed.py::_taxonomy_leaf` created them on the
   fly by walking a hardcoded path, so they were born with `key = NULL` and never existed in the
   markdown source of truth. They have been deleted, the demo paths flattened, and
   `test_seed_save_never_creates_nodes_deeper_than_a_leaf` fails the build if any come back.
   **`level == 1` IS the leaf set** — the classifier's three queries (`find_leaves_vector`,
   `leaves_without_embedding`, `leaf_keys_without_terms`) all hardcode it, so a node deeper than 1 is
   invisible to classification no matter what you put in it. Two sources of truth for one tree is the
   bug, not the drift.
10. **Curated data hangs off the stable KEY, never off the mutable LABEL.** `CATEGORY_TERMS` used to
    be keyed by leaf NAME. The markdown declares the opposite contract — *"the key is the IDENTITY,
    the text is only the LABEL"* — so every rename silently detached the curated terms: a
    `dict.get(name)` that misses returns `None`, not an error. It cost **9 leaves** (`Frutas`→`Frutas
    Frescas`, `Arena Para Gato`→`Arena Sanitaria`, `Lavado De Ropa`→`Detergentes & Suavizantes`, …).
    Worse, the damage was **masked**: the LLM CLI had backfilled the holes with lower-quality terms,
    so the index looked full. Now keyed by `key`; `test_renaming_a_leaf_keeps_its_curated_terms` is
    the regression. **General rule: if a row can be renamed, never key anything to its name.**
11. **A data file with no caller is dead data — check the wiring, not just the content.**
    `seed_category_terms` existed, was tested, and had **ZERO callers** in the whole repo. A fresh DB
    therefore got 134 leaves with `classification_terms = NULL`, and because `EmbedCategories` *is*
    wired into ingestion (`build_category_embedder`), it embedded them anyway — with the poor
    `{parent} {leaf}` recipe. **The index read 134/134 embedded and was running at 43% instead of
    77%.** Nothing logged. It's now called inside `seed_save`, right after `seed_taxonomy`, guarded by
    `test_seed_wires_category_terms.py`. When you add curated data, grep for its caller before
    believing it ships.
12. **You can measure this index WITHOUT a single ingested product.** Every phrase in
    `classification_terms` is a labelled example whose correct leaf is known. Embed each phrase RAW
    (query-side: `ClassifyStoreProduct` does `embed([product.name])`, no recipe) and check that
    `find_leaves_vector` returns its owner. The phrase is literally inside its own leaf's embedded
    text, so the probe is **biased toward passing — every failure is real, and it can only
    under-report.** Split the failures by score: **`>0.55`** means the wrong neighbour won with
    conviction → actionable; **`≤0.50`** is the cramped 0.47–0.49 zone this skill already documents →
    the isolated phrase carries no signal, but inside a full product name it still might, so do NOT
    conclude from it. Measured 2026-08-04 over 588 probes: **86.7% → 89.9%** top-1 after fixing 16
    leaves, actionable confusions **21 → 2**. **Stop when the survivors are genuine sibling proximity**
    (`alimento felino`→*Alimento Para Perro*, `leche descremada`→*Leches Condensadas & Evaporadas*) —
    chasing those overfits the probe instead of improving the classifier.
13. **The 17 roots carry terms + embeddings, and the classifier never reads them.** Populated on
    request so the table has no NULLs; harmless because all three index queries filter `level == 1`
    (verified after loading: `find_leaves_vector` still returns 134 candidates, not 151). **If anyone
    ever lifts that filter, re-measure FIRST** — a root competes with its own leaves and then neither
    discriminates. The warning is written into `ROOT_TERMS`. Also: **never delete the roots' rows in
    `taxonomy_node_market`.** Proven by rollback — `_market_nodes` INNER JOINs them, so dropping the
    17 rows takes `list_tree('DO')` from 17 roots / 134 leaves to **0 / 0**; the leaves survive in the
    table but become unreachable. The column that justifies those rows is `active`, not the vector.

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

- **A new taxonomy leaf** → add it to the markdown AND to `CATEGORY_TERMS` **by its key**.
  `test_every_leaf_has_curated_terms` / `test_no_orphan_terms_keys` fail the build if the two
  diverge, so you cannot forget. A termless leaf falls back to `"{parent} {leaf}"` (~43%).
- **Regenerate terms** → `seeds.generate_category_terms` (LLM, `--no-embed` to defer). **Caveat
  measured 2026-08-04:** the generator sees ONE leaf at a time and knows nothing about its siblings,
  so it leaks vocabulary across them — it gave `Detergente Infantil De Bebé` and `Detergentes &
  Suavizantes` the *same* tokens, and gave `Shampoo Para Mascotas` "de avena / de coco / de
  manzanilla", which collides head-on with human `Cuidado Capilar`. It also makes domain errors
  ("bananas" where DO says *guineo*; "cerezos", the tree, not the fruit). **If you regenerate, pass
  the SIBLING leaves in the prompt** — otherwise prefer the curated dict, which is reviewed and
  version-controlled.
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
| Bootstrap terms over live LLM | deterministic, zero quota, reviewed in git; the LLM leaks vocabulary across siblings | 134/134 leaves; probe 89.9% top-1 |
| `CATEGORY_TERMS` keyed by node KEY | the label is mutable by contract; keying by name lost 9 leaves to renames, silently | `test_renaming_a_leaf_keeps_its_curated_terms` |
| Seeds called from `seed_save` | a data file with no caller never reaches a fresh DB, and the failure is invisible | `test_seed_wires_category_terms.py` |

## Commands

```bash
cd apps/api
uv run pytest tests/save/unit/test_{classify_store_product,category_banding,category_embedding_text,generate_category_terms,llm_category_terms}.py
uv run pytest tests/save/integration/test_{category_candidate_repository,seed_category_terms}.py
# Curated terms now ship with the seed itself — `python -m seeds` calls them. Only needed by hand
# if you edited CATEGORY_TERMS and want it applied without a full re-seed (idempotent, no quota):
uv run python -c "from seeds.category_terms_data import seed_category_terms; from src.shared.db.base import SessionLocal; \
  s=SessionLocal(); print(seed_category_terms(s,'DO')); s.commit()"
# NOTE: both seeds only fill leaves whose terms are NULL — they never overwrite. To push an EDITED
# dict onto rows that already have terms you must `set_terms` them explicitly (which NULLs the
# embedding) and then re-run EmbedCategories.
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

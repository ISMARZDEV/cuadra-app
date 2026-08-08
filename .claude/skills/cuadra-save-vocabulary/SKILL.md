---
name: cuadra-save-vocabulary
description: >
  The METHOD for diagnosing and changing Save's classification VOCABULARY — the token→leaf lexicon
  index that decides most categories in production. Owns the diagnosis (the lexicon derives
  token→leaf from 134 short leaf NAMES and so confuses "unique in the taxonomy" with "identifies
  this class"), the measurement (P(root|token) is a TRAP with a skewed corpus — use LIFT), the
  three distinct failure modes that all look identical in the numbers (broken token vs taxonomy gap
  vs normal polysemy), and above all the NON-NEGOTIABLE rule: simulate any index change against the
  classifications you already have BEFORE applying it. That gate stopped two plausible rules that
  would have destroyed 298 and 455 correct classifications. Every number here was measured on 2562
  real products. Composes with cuadra-save-classification (the cascade that consumes the index) +
  cuadra-save (domain) + cuadra-api.
  Trigger: adding or demoting a token, editing `_ATTRIBUTE_TOKENS` or `classification_terms`,
  renaming a taxonomy leaf, debugging why a product classifies wrong or stays UNCLASSIFIED,
  measuring token reliability, or any change to
  contexts/save/infrastructure/classification/{lexicon,token_reliability}.py.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.1"
---

> **Your role:** a data/ML engineer with 15+ years in weak supervision and text classification who
> has been burned by keyword lists that "obviously" needed fixing. You know the vocabulary is the
> part of a classifier that looks trivial and is not: every token you touch moves thousands of
> products, and the ones you break are silent. **You never change the index on intuition — you
> simulate first and read the damage.** When a rule looks obviously right and you haven't measured
> its cost, you STOP.

> **Every number in this skill was MEASURED** on the 2026-08-01 corpus: 2562 store_products across
> 20 categories, 3 stores, weak-labeled by each store's own shelf. Re-measure before overriding.

## When to Use

| Situation | Start at |
|---|---|
| A product classifies into the wrong category | §Diagnose |
| A product stays UNCLASSIFIED and shouldn't | §Diagnose |
| You want to add/remove a token from the lexicon | §The gate (mandatory) |
| A taxonomy leaf is invisible to the lexicon | §Taxonomy rules |
| You want to auto-tune the vocabulary with an LLM | §Why the LLM can't decide |

## The diagnosis (why this keeps happening)

`build_lexicon_index` derives `token → leaf` from a corpus of **134 short strings** (133 when the
2562-product measurement below was run) — the leaf names — and declares any token appearing in
exactly one leaf an identifier of that leaf. That conflates **unique in the taxonomy** with
**identifies this class**.

The information needed lives in the **product corpus**, which the index never sees:

| token | in the taxonomy | in 2562 real products |
|---|---|---|
| `secos` | unique (Semillas & Frutos Secos) | 6 uses, **6 are guandules** (dry pigeon peas, not nuts) |
| `semillas` | unique | `Uvas Rojas SIN Semillas` — the ABSENCE deciding the leaf |
| `polvo` | unique (Bebidas En Polvo) | 88 uses, ~60 are laundry detergent |
| `arroz` | unique | 128 uses, wrong for `Tortilla De Arroz`, `Morcilla De Arroz` |

Second structural gap: **the lexicon does not read `classification_terms`.** Those 134 curated
vocabularies (measured top-1 43%→77%) feed ONLY the vector stage. The stage that decides most cases
in production is the one blind to the curated vocabulary.

## Critical Patterns (every one MEASURED — do NOT relearn)

1. **SIMULATE BEFORE YOU APPLY. This is the rule.** Run the proposed index change over the
   classifications that already exist and count what breaks. It stopped two plausible rules:
   "demote when the corpus root disagrees with the index" (**298 correct classifications lost**)
   and "demote when the token doesn't concentrate" (**455 lost**). Both looked right on paper.
   Script: `apps/api/seeds/measure_token_reliability.py` — read-only, run it before every
   vocabulary edit.

2. **Use LIFT, never raw P(root | token).** With a skewed corpus, P tends to the majority class
   prior, not the token's power. Measured with the corpus at 84% one root, `«lbs»` — a unit of
   measure — scored P=1.00 and topped the "identifier" list. `lift = P(root|token) / P(root)`
   fixed it: 24 "candidates" collapsed to 4.

3. **A skewed corpus cannot evaluate its own tokens.** At 84% dominance the maximum achievable lift
   for any token of that root is `1/0.84 = 1.19`, and every one pins there — `arroz` (which fails)
   became indistinguishable from `habichuela` (which is fine). **The blocker is DIVERSITY, not
   volume**: adding more queries of the same category makes it worse. Fixed by activating 3 basket
   queries × 20 categories → majority root 84%→39%, lift ceiling 1.19→2.56.

4. **Three failure modes look identical in the numbers. Do not treat them alike.**

   | mode | example | fix |
   |---|---|---|
   | Broken token (form/state modifier) | `polvo`, `congelado`, `integral`, `secos` | demote |
   | **Taxonomy gap** | `detergente` concentrates 100% in Limpieza, but the only leaf naming it is «Detergente De Bebé» | **curate the taxonomy — do NOT demote** |
   | Normal polysemy | `leche` (cow / coconut / body lotion), `pollo`, `queso` | leave alone |

   `mismapped` on `TokenReliability` flags mode 2 for human review.

5. **The measurement may only TAKE AWAY, never grant.** A token is demoted with evidence against
   it; absent evidence it stays. `build_lexicon_index(leaves, demoted=None)` reproduces the previous
   behavior exactly, so an unrun or thin measurement can never gut the index.

6. **Normalize both sides or the change won't land.** `_tokens` folds Spanish plurals, and it runs
   on index build AND on lookup. A stem applied to one side only silently matches nothing. The
   asymmetry is the bug: `Alimento Para Perro` (leaf) vs `Alimentos para perros` (store path) never
   met until `_singular` existed.

7. **An attribute token is not a class token.** The criterion for `_ATTRIBUTE_TOKENS`: does the word
   name the product's CLASS, or a PROPERTY of it? `secos` (state), `semillas` (absence),
   `alimentos` (too generic) are properties. `arroz`, `pan`, `galletas` name the class and must
   stay. **Every entry needs a measured case behind it — never add on intuition.**

8. **Fixing one thing can un-hide another.** Removing the `alimentos → Alimentos Para Bebé` bug
   turned a case from *abstained* into *misclassified*: the bug had been fabricating a false second
   signal whose conflict caused an accidentally-safe abstention. Always re-run the full simulation
   after a vocabulary change, not just the case you targeted.

## Why the LLM can't decide this

Ask an LLM "does `secos` identify Frutos Secos?" and it says yes — it reads reasonable. The corpus
says no. **The corpus statistic is exactly what the model cannot see.** The LLM proposes candidates;
the measurement judges them; a human approves. Never let a model write the index.

Evidence from this repo: a hand-added `_ATTRIBUTE_TOKENS` entry caused a regression (dog food →
`Arroz, Granos & Legumbres`) caught only by a guard test and a probe. An unsupervised agent ships it.

## Taxonomy rules that govern the lexicon

- Every leaf must own **≥1 token (≥3 chars) that no other leaf uses**, or it is invisible to the
  lexicon and depends on the vector stage alone. `test_every_leaf_owns_at_least_one_unambiguous_token`
  guards this.
- Plural/singular no longer split a token — but that guard test **was passing for the wrong reason**
  before `_singular` existed: `Alimentos Para Bebé` looked unique only because `alimentos` ≠
  `alimento`. Three leaves were exposed as never having owned a token.
- Renaming a leaf changes the lexicon input but does **not** invalidate its embedding
  (`save_taxonomy_seed.py`). Only `set_terms` does. A rename leaves the vector index stale.
- ~~`CATEGORY_TERMS` is keyed by leaf **NAME** while the tree is keyed by `key` — a rename silently
  desyncs the curated bootstrap.~~ **FIXED 2026-08-04** — and this skill called it before it bit.
  It had already cost **9 leaves** by then (`Frutas`→`Frutas Frescas`, `Arena Para Gato`→`Arena
  Sanitaria`, `Lavado De Ropa`→`Detergentes & Suavizantes`, …); the LLM CLI had backfilled the holes
  with weaker terms, so nothing looked wrong. `CATEGORY_TERMS` is now keyed by `key`, guarded by
  `test_renaming_a_leaf_keeps_its_curated_terms` +
  `test_every_leaf_has_curated_terms`/`test_no_orphan_terms_keys`.
  **The lesson generalises past this file: if a row can be renamed, never key anything to its name.**
- **The tree is TWO levels** — 17 roots + 134 leaves. The `level ≥ 2` nodes that used to exist
  (`Arroz`, `Granos`, `Legumbres`, …) were demo scaffolding created by `save_seed.py`, never present
  in the markdown; they are gone and a guard test keeps them out. `level == 1` IS the leaf set.
- **STILL OPEN:** renaming a leaf changes the lexicon input and the embedding recipe input, but
  `save_taxonomy_seed` does not NULL the embedding — only `set_terms` does. **A rename therefore
  leaves the vector index stale**, describing the old label. Re-embed by hand after a rename until
  this is closed.

## Code Examples

```python
# Measure — pure, no DB. Weak label = the store's own shelf (source_category), which is
# independent of the product NAME the token comes from, so it is not circular.
from src.contexts.save.infrastructure.classification.token_reliability import (
    LabeledProduct, measure_token_reliability, demoted_tokens,
)
verdicts = measure_token_reliability(corpus, index, root_of_leaf)
demoted = demoted_tokens(verdicts)              # only lift < 1.0 — the unambiguous signal
mismapped = [v for v in verdicts if v.mismapped] # taxonomy gaps → human review, do NOT demote
```

```python
# Apply — and note demoted=None is the exact previous behavior.
index = build_lexicon_index(leaves, demoted=demoted)
```

## Commands

```bash
# THE GATE — run this before ANY vocabulary edit. Read-only.
cd apps/api && uv run python -m seeds.measure_token_reliability

# Backfill classification over everything without an active category
cd apps/api && uv run python -c "from src.shared.db.base import SessionLocal; \
from ingestion.save.composition import build_classify_backfill; \
s=SessionLocal(); print(build_classify_backfill(s).execute('DO', is_canonical=False)); s.commit()"

# Turn a flag off for ONE process without touching .env (the .env is permission-denied)
SAVE_RELEVANCE_GATE_ENABLED=false uv run python -m seeds.save_refresh
```

## Decisions (re-benchmark before overriding)

| Decision | Why | Evidence |
|---|---|---|
| Demote only on `lift < 1.0` | The only signal with no benign reading | the other two rules cost 298 and 455 classifications |
| Weak-label from `source_category` | Free supervision at scale, no human labeling | 1483 of 2562 products labeled (57%) |
| Measure at ROOT, not leaf | Leaf level is too sparse at this corpus size, and root is what R2 needs | — |
| Vocabulary lives in code (`_ATTRIBUTE_TOKENS`), not data — **for now** | Moving it to `classification_terms` needs the ambiguity trade-off measured first; brand terms would collide and the ambiguity rule DROPS collided tokens, so adding terms can delete tokens that work today | not yet measured |
| Never auto-apply demotion | The measurement's value is the ranked diagnostic; `detergente` proved a machine-perfect detection whose correct fix was curating the taxonomy | §Critical Patterns 4 |

## Resources

- `.claude/skills/cuadra-save-classification/SKILL.md` — the cascade that consumes this index
- `.claude/skills/cuadra-save-matching/SKILL.md` — the sibling cascade; same "measure, don't tune" doctrine
- `docs/pending/save-classifier-pendientes.md` — earlier measurements (92% precision / 73% recall, n=30)
- `docs/research/save-fable/taxonomia-multi-idioma.md` — key/label/recognition split, per-market terms
- `docs/research/save-fable/Categorias_y_Subcategorias.md` — the taxonomy source of truth (markdown)

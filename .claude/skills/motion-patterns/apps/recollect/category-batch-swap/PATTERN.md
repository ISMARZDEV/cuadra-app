---
name: motion-category-batch-swap
description: >
  Reusable motion pattern: a grid of content tiles is REPLACED wholesale on a timer, quadrant by
  quadrant with a ~120ms stagger, while nothing translates. The slots never move — only what is in
  them changes — so a showcase can run for minutes without ever looking like a scroll the user
  failed to control. Reanimated 4 + TypeScript.
  Trigger: building an ambient content showcase, an onboarding backdrop, a category preview grid,
  a "look what's inside" screen — any surface that must keep changing without asking to be touched.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: recollect (60fps MCP shot + measured video)
  evidence: single-source
---

> Distilled from the same shot as [`../brand-mark-to-caret-morph`](../brand-mark-to-caret-morph/PATTERN.md)
> and [`../rolling-word-swap`](../rolling-word-swap/PATTERN.md).
> **Working code in [`src/`](src/)** — typechecked against `apps/mobile`.

## Reference

| | |
|---|---|
| **Shot** | `recollect-logo-morph-to-features-animation` |
| **Window** | `w3` — 5483 → 17767 ms (**12.3 s** of continuous showcase) |
| **Evidence** | `single-source` — see the checklist |

### ⭐ The headline finding is a NEGATIVE one

The MCP says *"an array of image cards **scrolls** through the screen background"*.

**It does not scroll.** Phase correlation over a 260×600 card column, at lags of 100 / 200 / 500 ms,
returns **0–2 px** of vertical displacement while RMSE grows 0.059 → 0.122. The content changes
*without translating*.

Building this as a scroll would have implemented the description instead of the motion — and would
have felt wrong in a way nobody could name: an autoscrolling grid reads as a list the user has lost
control of, while a grid that swaps in place reads as a display.

### Measured

| | |
|---|---|
| Batch interval | ~**2.4 s** (5 category phrases across 12.3 s) |
| Quadrant stagger | **100–150 ms** apart, from quadrant luminance |
| Vertical translation | **0–2 px** — none |
| Window class | **perpetual** — sampled at 2 fps for cadence, not for a curve |

## Description
A grid of tiles whose contents are exchanged on a timer, the regions staggered so the change reads
as a wave rather than a cut. The slots are fixed.

## Use cases
1. **An ambient showcase behind an onboarding or splash** — the source case.
2. **A category preview grid** that cycles what each category contains.
3. **A screensaver-like idle state** for a kiosk or TV surface.

## Trigger
`system event` — a timer. Nothing here is finger-driven.

## Initial state
Every slot settled (`progress = 0`), first batch already mounted.

## Animated properties
| Property | Role |
|---|---|
| `progress` per slot | PRIMARY, one per slot, offset by index |
| `opacity` · `scale` | DERIVED from it |

Positions are **never** animated. That is the pattern.

## Motion model
Each slot runs `withSequence(out, back)` — one value describing a whole exchange, so the two halves
cannot desynchronise — offset by `index × 120 ms` via `withDelay`.

⭐ `withDelay`, never chained `setTimeout`: the anti-pattern this method names explicitly.

## Spring/easing configuration
Out: `withTiming(140 ms)`. Back: `{ mass: 1, stiffness: 220, damping: 26 }` (ζ ≈ 0.88) — a tile
arriving into a fixed slot must not overshoot, for the same reason a resizing container must not.

Stagger **120 ms**, above the library's `balanced` prior of 70 ms because the elements are large:
simultaneous replacement of big tiles reads as a cut.

## Gesture behavior
N/A, and deliberately so: it is ambient. If the user should be able to grab it, this is the wrong
pattern — use a real scroll view.

## Entry / exit behavior
Symmetric per slot. The batch fades out at the end of the sequence.

## Implementation

### Ours — the files that ship
| File | What |
|---|---|
| [`src/motion/timings.ts`](src/motion/timings.ts) | measured cadence + stagger, and the no-scroll finding |
| [`src/motion/use-batch-swap.ts`](src/motion/use-batch-swap.ts) | one slot's exchange |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh recollect category-batch-swap
```

## Corroboration checklist (SKILL.md §5)

1. **Survives stripping the app?** ✅ *A fixed grid whose contents are exchanged in staggered
   regions.* No brand, no copy.
2. **Physics inside the library's priors?** ⚠️ Partly. The stagger sits above `balanced` and the
   swap spring is unremarkable — but the **cadence** (2.4 s) is a product decision, not physics,
   and nothing in the library corroborates it.
3. **Three different screens?** ✅ Onboarding backdrop · category preview · idle/kiosk state.
4. **Parameterisation real?** ✅ Interval, stagger, slot count, tile content.
5. **What would falsify it?** If the 2.4 s cadence is tuned to *this reel's narration* rather than
   to perception, the number is editorial, not a pattern. It very likely is — the shot is a
   promotional video, and each batch is timed to a phrase.

⭐ **Passes 1, 3 and 4 but is graded `single-source`, not `corroborated`.** Question 5 answers
itself: this comes from a *promo reel*, so its timing serves a script rather than a user. The
mechanism (fixed slots, staggered exchange, no translation) is solid; the **2.4 s interval should
be re-derived** for any real product. Recorded honestly so a future session does not inherit a
marketing cadence as if it were a finding.

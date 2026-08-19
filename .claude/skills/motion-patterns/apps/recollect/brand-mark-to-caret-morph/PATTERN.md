---
name: motion-brand-mark-to-caret-morph
description: >
  Reusable motion pattern: a brand mark contracts — non-uniformly and completely dry — until it IS
  the blinking caret of a search field. Identity is spent buying the affordance instead of being
  replaced by it. Critically damped (ζ 1.00), the highest in the library, because a text cursor is
  the one element a user expects to be perfectly still. Reanimated 4 + TypeScript.
  Trigger: building a splash that hands off to a search or input screen, a logo that becomes a
  control, an empty-state mark that turns into a field — or any moment where brand identity must
  become a usable affordance without a cut.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: recollect (60fps MCP shot + measured video)
  evidence: corroborated
---

> Distilled with the `60fps-to-reanimated` method using the MCP **for the description** and the
> video **for every number**. Raw data in [`../shot-logo-morph-to-features.json`](../shot-logo-morph-to-features.json).
> **Working code in [`src/`](src/)** — typechecked against `apps/mobile`.

## Reference

| | |
|---|---|
| **Shot** | `recollect-logo-morph-to-features-animation` — https://60fps.design/shots/recollect-logo-morph-to-features-animation |
| **`source`** | `recipes` — generic snippets only, no compile-checked Swift file (the usual case: 5 of 6) |
| **`animation` (MCP)** | `.spring(response: 0.45, dampingFraction: 0.72)` — **label-derived, and wrong here** |
| **Measured** | `.spring(response: 0.135, dampingFraction: 1.00)` → `{ mass: 1, stiffness: 2162, damping: 93 }` |
| **Evidence** | `corroborated` |

### ⭐ Where the MCP was wrong, and why

The MCP's keyframes are **1 s apart**. This morph lasts **178 ms**. It fell entirely between two
samples, so the record describes the start state as *"a white vertical bar representing the logo
mark"* — but that bar is already the **caret**. The bookmark-shaped mark it morphs FROM exists for
~375 ms and the MCP never saw it.

Its `animation` is wrong for the same structural reason: `.spring(0.45, 0.72)` is the default
derived from `timing: medium` + `springiness: subtle`, and it is **3.3× slower** than the footage.

> This is the method's rule in one shot: **describe from the MCP, measure from the video, and let
> the measurement overrule the description.**

### Measured

| | |
|---|---|
| Onset → settle | 292 → 470 ms (**178 ms**) |
| Glyph bounding box | 70×86 → **5×48** |
| Scale | **non-uniform**: width to 7%, height to 56% |
| Fit | ζ **1.00**, ω₀ **46.5** (rms 0.0151) |
| Beaten | iOS-standard/140 ms (0.0236) · easeOut/100 ms (0.0340) |
| Overshoot | **none at any frame** |

## Description

A brand mark contracts non-uniformly until it becomes the text caret of a search field. The field's
prompt arrives afterwards; the mark itself never fades out and back in — it is the same object.

## Use cases

1. **A splash handing off to a search screen** — the source case.
2. **An empty state whose icon becomes the input** it is inviting you to use.
3. **A collapsed FAB that turns into a compose field.**

## Trigger
`system event` (app launch). Equally valid on tap.

## Initial state
`progress = 0`: mark at full size, caret at zero opacity, blink clock already running but gated off.

## Animated properties

| Property | Role |
|---|---|
| `progress` | **PRIMARY** — the one driver |
| `scaleX` / `scaleY` on the mark | DERIVED, and independent of each other |
| `opacity` on both layers | DERIVED (crossfade at 0.45–0.6) |
| caret blink | **independent perpetual clock**, gated on `progress > 0.98` |

## Motion model

One driver for the morph. The blink is deliberately NOT derived from it: it is perpetual, so it
runs on its own linear clock and is simply gated until the caret exists.

⭐ **How the morph is faked, stated plainly.** The reference interpolates the glyph's PATH — a
bookmark's notch flattens as it narrows. Non-uniformly scaling a bookmark yields a squashed
bookmark, not a caret, so `src/` crossfades two layers while both carry the measured scale. The
silhouette is exact at both ends and approximate in the middle, which at 178 ms on a 5 px target is
invisible. Use Skia `interpolatePath` if the mark is complex enough for the cheat to show.

## Spring/easing configuration

```
ω₀ = 46.5  →  response = 2π/ω₀ = 135 ms
mass      = 1        ⭐ explicit — Reanimated 4 defaults to 4
stiffness = ω₀²      = 2162
damping   = 2ζω₀     = 93
```

⭐ **ζ 1.00 is the highest in the library and it is not timidity.** 0.72 is for things that ARRIVE;
0.84 for a drawer set aside; this sits above both because it becomes a **cursor**, and overshoot on
a text caret reads as a glitch rather than as delight.

⭐ The blink is `Easing.linear` thresholded to on/off. An eased blink is a pulsing glow — a
different idea, and the wrong one.

## Gesture behavior
N/A. This is a launch transition with nothing to grab; adding a drag would invent an affordance the
reference does not have.

## Entry / exit behavior
Symmetric — the same spring runs in reverse at the end of the sequence, because it is one object
going back the way it came.

## Implementation

### Reference SwiftUI — not used
`source: "recipes"`: five generic snippets (scale-pop, stagger, fade, morph/matchedGeometry, scrub)
parameterised by the shot's `animation`. None covers a non-uniform mark-to-caret contraction, and
the `animation` they carry is the value measurement disproved. **Taken: nothing. Discarded: all.**

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | measured constants + the arithmetic |
| [`src/motion/use-mark-to-caret.ts`](src/motion/use-mark-to-caret.ts) | driver, derivations, blink clock |
| [`src/components/mark-caret.tsx`](src/components/mark-caret.tsx) | the two-layer view |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh recollect brand-mark-to-caret-morph
```

## Corroboration checklist (SKILL.md §5)

1. **Survives stripping the app?** ✅ Remove the bookmark shape and the brand: *a mark contracts
   into the caret of a field*. Nothing branded remains in that sentence.
2. **Physics inside the library's priors?** ✅ Agrees with *continuous values never spring* and with
   *perpetual motion is linear* (the blink). It **diverges** by sitting at ζ 1.00 — above every
   other pattern — and the reason is written above: it becomes a cursor.
3. **Three different screens?** ✅ Splash → search · empty state → input · FAB → compose field.
4. **Parameterisation real?** ✅ The mark, the caret's size and colour, and the two scale ratios.
   The structure is identical.
5. **What would falsify it?** If most apps that morph a logo into a control use a *uniform* scale
   plus a crossfade, then the non-uniform contraction is this app's signature and this drops to
   `single-source`. Check three shipped iOS splash-to-search transitions; if two scale uniformly,
   demote.

**Passes 1, 3 and 4** — the stated floor. Graded `corroborated`.

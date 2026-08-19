---
name: motion-push-back-drawer-reveal
description: >
  Reusable motion pattern: the whole current screen slides aside as ONE rigid card to uncover a
  navigation panel mounted beneath it — the inverse of the usual drawer, which slides a panel over
  the content behind a scrim. The card does not scale, does not dim and casts no shadow, so the
  user's context stays literally present instead of becoming a picture of itself. The panel never
  moves; only its opacity rises, derived from the card's position. Notably SYMMETRIC: the same
  spring runs both ways, because a toggled navigation surface is not a dismissal.
  Reanimated 4 + Gesture Handler + TypeScript.
  Trigger: building a navigation drawer, side menu, account switcher, filter panel or any surface
  revealed by moving the current screen out of the way — and whenever a drawer feels loose on
  arrival or the revealed panel feels like a separate animation that lags the content.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: x (user-supplied clip, no MCP)
  evidence: corroborated
---

> Distilled with the `60fps-to-reanimated` method **without the 60fps MCP** — from a clip the user
> supplied. Raw data in [`../shot.json`](../shot.json).
> **Working code in [`src/`](src/)** — typechecked against `apps/mobile`.

## Reference

| | |
|---|---|
| **Source** | user-supplied clip, `X-Twiter.mp4` (1620×2160, 4.1s, 60fps) |
| **Frames** | [`frames/`](frames/) — 1080px, 60fps, only inside the motion windows |
| **`source`** | `manual` — no MCP metadata; everything below is MEASURED |
| **Evidence** | `corroborated` (single clip; checklist at the end) |

### Measured motion windows

`segment-motion.py` found three in 4.1s. **Only two are animations:**

| Window | Span | Motion | What happens |
|---|---|---|---|
| `w1_00517-01000ms` | 517 → 1000 ms | **652 → 834 ms (182 ms)** | screen slides aside, panel uncovered |
| `w2_02617-03317ms` | 2617 → 3317 ms | **2767 → 2967 ms (200 ms)** | screen returns |
| `w3_03850-04067ms` | 3850 → 4067 ms | **none** | detector noise — luminance constant to 0.1/255 across all 14 frames. Recorded so nobody re-investigates it. |

⭐ **The window duration is data before any spring is measured.** 182 ms out and 200 ms back is a
near-symmetry, and it was the first hint that this pattern does not do what the library's other two
asymmetric patterns do.

### How it was measured

The clip was re-extracted at **60 fps** after 20 fps put only 3–4 frames inside the open — too
coarse to tell a bounce from a stop. Positions were then read **by eye** off gridded *kymographs*:
one 24 px band per frame, stacked, so 30 frames of trajectory read as a single staircase and any
reversal would be visible as a kink. No pixel edge detector was written (SKILL.md §0a).

| Fitted | Open | Close |
|---|---|---|
| **ζ** | 0.84 | 0.84 |
| **ω₀** | 25.5 | 25.0 |
| rms vs best easing | **0.0081** vs 0.0124 (`easeOut`/150 ms) | **0.0047** vs 0.0084 (iOS-standard/205 ms) |

A spring fits ~1.6× better than the best easing in **both** directions, and both land on the same
ζ and ω₀ within measurement error — so one config ships for both.

### What the reference does NOT do

Four negative findings, each measured rather than eyeballed. They matter more than the spring,
because each is a thing you would otherwise add by reflex:

| Not there | How that was established |
|---|---|
| **No scale** on the pushed screen | glyph sizes and every vertical landmark identical at rest, mid-motion and settled |
| **No dim/scrim** on the pushed screen | luminance of a text block sampled *following* the translation stays 31–35/255 throughout |
| **No parallax** on the panel | its items sit at the same x in every frame — it is static and only fades |
| **No shadow** on the leading edge | the luminance step is 0 → 6 → 14 over 8 px: an antialiased hard edge, not a gradient |

## Description

The whole current screen translates sideways as one rigid card by ~78% of its width, uncovering a
panel that was already mounted beneath it at full position and zero opacity. The panel's opacity is
derived from the card's position, so it becomes legible exactly as the card stops. A ~22% sliver of
the card stays on screen as the way back.

## Use cases

1. **A navigation drawer / side menu** — the source case.
2. **A filter or facet panel** in a catalogue: push the results aside rather than covering them, so
   the user keeps seeing what is being filtered.
3. **A master–detail split on a tablet or foldable**, where the list slides aside to give the
   detail full width and can be pulled back.

## Trigger

`tap` in the reference. Our implementation adds a drag — see *Gesture behavior*.

## Initial state

`translate = 0`. The panel is mounted, at its final position, `opacity 0`, and **must be inert**
(`pointerEvents: 'none'`) — an opacity-0 view still swallows touches.

## Animated properties

| Property | Role |
|---|---|
| `transform: translateX` on the card | **PRIMARY** — the one driver |
| `opacity` on the panel | **DERIVED** from the driver |
| `borderRadius` on the card | constant 8 pt — never animated |

Transform and opacity only. Nothing here costs a layout pass.

## Motion model

One shared value, in points, leads. The panel derives from it. The reference justifies this rather
than convention doing so: measured panel opacity tracks the measured position curve to within 2% at
every sampled frame (0.713 vs 0.731 · 0.883 vs 0.900 · 0.960 vs 0.974 · 0.995 vs 0.998), which is
what one value feeding two channels looks like. Two parallel animations would drift the moment a
finger interrupts them.

## Spring/easing configuration

```
ζ  = 0.84         (measured, both directions)
ω₀ = 25.3         (mean of 25.5 open / 25.0 close) → response = 2π/ω₀ = 248 ms

mass      = 1                        ⭐ explicit — Reanimated 4 defaults to 4
stiffness = mass·ω₀² = 640
damping   = 2ζ·mass·ω₀ = 42.5
```

⭐ **ζ 0.84 is deliberately above the library's 0.72 "premium arrival" signature.** 0.72 belongs to
things that ARRIVE — a sheet, a snapping card, a travelling indicator. This is a surface being SET
ASIDE, and it must stay put once it lands: at ζ 0.72 a 78%-of-screen travel overshoots by ~24 pt,
which reads as loose. At 0.84 the overshoot is ~4 pt, below what the eye resolves — matching the
reference, where 31 settled frames show no reversal at all.

⭐ It agrees with the library from the other direction too: **k640/ζ0.84 is the same tempo as
`flighty/snap-carousel-spring` (k632) with a drier character** — precisely the recorded prior that
*stiffness is tempo, damping is character*.

## Gesture behavior

⭐ **The reference does not witness this.** The clip only ever shows a tap; there is no drag phase
anywhere in it. The physics below is OURS, and it is here because a drawer the finger cannot drag
is broken however good the tap looks (SKILL.md §4).

- 1:1 tracking, **clamped** to the corridor. No rubber-band: the reference has hard stops at both
  ends, and stretching past the open position invites a second, meaningless gesture.
- Commit on **distance OR velocity**: past 50% of the travel, or a flick over 500 pt/s.
- ⭐ `velocity` is handed to the spring on release. Without it the motion visibly cuts.
- Reduce Motion disables the **settle**, never the finger. Dragging is not an animation.

## Entry behavior

182 ms, ζ 0.84, ω₀ 25.5.

## Exit behavior

200 ms, ζ 0.84, ω₀ 25.0 — **the same spring, symmetric.**

⭐ This is the third distinct answer in the library and it was *derived, not copied*.
`premium-bottom-sheet-spring` exits faster and drier (a dismissal should obey);
`pill-to-panel-expansion` exits 1.5× slower (it hands context back). Here the exit is **identical**,
because a navigation drawer is neither: it is one persistent surface being toggled, the same object
going back the way it came. An asymmetry would imply the two directions mean different things, and
here they do not.

## Implementation

### Reference SwiftUI — none

There is no MCP record and therefore no SwiftUI to consult. Nothing is lost: the physics above is
measured rather than reported, which is strictly more reliable than a `springiness: "subtle"` label.

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | the measured constants, with the arithmetic |
| [`src/motion/use-push-back-drawer.ts`](src/motion/use-push-back-drawer.ts) | the driver, the derivation and the gesture |
| [`src/components/push-back-drawer.tsx`](src/components/push-back-drawer.tsx) | the two-layer view |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh x push-back-drawer-reveal
```

⭐ The controller is returned from the hook and **accepted as a prop** by the view, so a parent can
open the drawer from a header button and derive its own motion from `progress`. A component that
owned the driver privately would compile perfectly and be useless — the `SnapCarousel` lesson.

## Configuration

| Prop | Type | Default | What it changes |
|---|---|---|---|
| `screenWidth` | `number` | — | travel basis, in points |
| `openFraction` | `number` | `0.78` | how far the card slides; the remainder is the sliver back |
| `side` | `'left' \| 'right'` | `'right'` | which way the card is pushed |
| `onOpenChange` | `(open: boolean) => void` | — | fires at the COMMIT point only |
| `controller` | `PushBackDrawerController` | own | drive it from a parent |

## Corroboration checklist (SKILL.md §5)

`library.py triangulate x` reported **no overlap** and suggested `single-source`. That suggestion is
not accepted, and the reason is written down: the tool compares `interaction_pattern` verbs against
the library, and the library contains **no other drawer at all**. That is absence of evidence, not
evidence that this is one app's idiosyncrasy. §5's checklist is what decides.

1. **Does the mechanism survive stripping the app?** ✅ Delete the logo, the avatar, the copy and
   the dark theme, and there is still a mechanism: *the current screen moves aside as a rigid card
   to uncover a static panel whose opacity follows it*. Nothing in that sentence is branded.
2. **Does its physics land inside the library's priors?** ✅ Same tempo as the carousel (k632 vs
   k640) with a drier character, exactly as *stiffness is tempo, damping is character* predicts.
   ζ 0.84 sits in the band the library already reserves for containers that must not overshoot.
   The symmetry **diverges** from both recorded asymmetries — and that divergence has a reason,
   stated above, which is what §5 asks for.
3. **Three DIFFERENT screens?** ✅ Navigation drawer · filter panel over a result list ·
   master–detail split on a tablet.
4. **Is the parameterisation real?** ✅ What changes between those three: `openFraction`, `side`,
   the panel's content, and whether a parent drives `progress`. The structure is identical.
5. **What would falsify it?** The observation that most premium iOS apps reveal a drawer by sliding
   a panel **over** the content behind a scrim — the Material arrangement — rather than pushing the
   content aside. If that is the norm, then *push-aside with no scrim, no scale and no shadow* is
   this app's signature and this record should be demoted to `single-source`. Concretely: check
   three shipped iOS apps with a left drawer; if two or more overlay instead of pushing, demote.

**Passes 1, 3 and 4** — the stated floor. Graded `corroborated`.

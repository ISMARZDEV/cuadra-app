---
name: motion-traveling-selection-indicator
description: >
  Reusable motion pattern: one shared highlight that TRAVELS from the old option to the new one on
  tap, instead of each option fading its own background in and out. The single moving object is what
  makes a segmented control, tab bar, filter row or picker feel physical. Covers measuring targets
  with onLayout, animating to a measured position, and why per-option crossfade always feels cheaper.
  Physics converted from a real iOS reference (5 apps triangulated).
  Trigger: building a segmented control, tab bar, filter chip row, option picker, radio group, or any
  selector where exactly one item is active — and whenever a selection change feels flat or abrupt.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: brilliant-choose-voice-interaction
  status: implemented — src/ typechecked
---

> Distilled with the `60fps-to-reanimated` method. The reference clip sits in this folder;
> the shot's raw motion data is in `../shot.json`. **Working code in [`src/`](src/)** —
> typechecked against `apps/mobile`. Copy it, don't retype it.

## When to Use

- Segmented controls and tab bars.
- Filter/chip rows with a single active item.
- Option pickers where the choice has personality (voice, avatar, theme).
- Radio groups that deserve better than a dot.

## Description

⭐ **One object moves. Nothing fades.** The reference makes the point vividly: a character *hops*
from card to card. Strip the mascot and the mechanic remains — a shared indicator with continuity of
identity.

## Trigger

`tap` on a non-active option.

## Initial state

| Shared value | At rest |
|---|---|
| `indicatorX` | centre of the active option |
| `indicatorW` | width of the active option |
| `layouts[i]` | measured `{ x, width }` per option |

## Animated properties

- **Primary**: `indicatorX`, `indicatorW` (and `translateY` if it arcs).
- **Derived**: per-option label colour, from distance to the indicator.

## Motion model

Measure every option with `onLayout` into a shared array. On tap, spring `indicatorX`/`indicatorW`
to the target's measured geometry. The labels do not animate independently — their colour is
`interpolateColor` over the indicator's proximity, so the highlight *reveals* the active label
rather than two labels crossfading.

⭐ **Add a hop to sell it.** A pure horizontal translate reads mechanical. Coupling a small arc —
`translateY` peaking mid-flight, derived from the horizontal progress — turns a slide into a jump:

```
t = |indicatorX - fromX| / |toX - fromX|      // 0 → 1
lift = -14 * sin(t * π)                        // 0 at both ends, -14 at the middle
```

That one line is the difference between a segmented control and a character.

## Spring/easing configuration

`.spring(response: 0.45, dampingFraction: 0.72)` → ω₀ = 13.96 → `{ mass: 1, stiffness: 195, damping: 20.1 }`

Identical to the premium bottom sheet's entry — the same "confident, barely bouncy" signature. ζ 0.72
keeps overshoot to a hint, which matters here: an indicator that visibly bounces past its target
looks like it missed.

Stagger: **0**.

## Gesture behavior

Tap only. If made draggable, the indicator follows the finger and snaps to the nearest measured
option on release, with `velocity` handed off.

## Entry behavior

The indicator appears already placed on the default option. It must never animate in from zero — a
selector that assembles itself on mount looks unstable.

## Exit behavior

None — persistent control.

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"`; generic spring/slide/fade only.

### Ours

`onLayout` per option → shared array; `withSpring` on `indicatorX`/`indicatorW`;
`useDerivedValue` for the arc; `interpolateColor` for labels.

## Do

- Measure with `onLayout`; never hardcode option widths (i18n changes them).
- Animate width too — options are rarely equal width.
- Derive label colour from the indicator's position.
- Add the sine arc if the product has any personality.

## Don't

- ❌ Fade a background in on the new option and out on the old — that is two objects, not one.
- ❌ Hardcode positions.
- ❌ Animate the indicator in on mount.

## Accessibility / Reduce Motion

⭐ Reduce Motion → the indicator **jumps** to the new option (still one object, no travel). Keep
`accessibilityRole="tab"` / `"radio"` and `accessibilityState={{ selected }}` — the highlight is
decoration, the state must be real.

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh traveling-selection-indicator
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | INDICATOR + HOP_HEIGHT |
| [`src/components/traveling-indicator.tsx`](src/components/traveling-indicator.tsx) | measure, travel, and the sine arc |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh brilliant traveling-selection-indicator
```

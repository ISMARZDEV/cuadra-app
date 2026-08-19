---
name: motion-snap-carousel-spring
description: >
  Reusable motion pattern: a horizontally paged carousel whose cards snap into place with a fast,
  barely-bouncy spring, where the page indicator and any parallax are DERIVED from live scroll
  offset rather than from an onPageChange event. Includes the rule for stacking two independent
  carousels on one screen without their gestures fighting.
  Physics converted from a real iOS reference (5 apps triangulated).
  Trigger: building a paged card carousel, a paywall/pricing selector, an onboarding value-prop
  pager, a feature showcase, or any horizontally snapping list — and whenever a page dot lags the
  swipe or two scrollables on one screen steal each other's gesture.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: flighty-pricing
  status: implemented — src/ typechecked
---

> Distilled with the `60fps-to-reanimated` method. The reference clip sits in this folder;
> the shot's raw motion data is in `../shot.json`. **Working code in [`src/`](src/)** —
> typechecked against `apps/mobile`. Copy it, don't retype it.

## When to Use

- Paywall / pricing plan selectors.
- Onboarding value-prop pagers.
- Feature showcases with one card in focus.
- Any "one item at a time" horizontal list.

## Description

Fast and tight. The card is under the finger, then it lands. `stagger: none` — nothing cascades.

## Trigger

Horizontal swipe. `gesture_or_trigger: swipe`.

## Initial state

| Shared value | At rest |
|---|---|
| `scrollX` | `0` — the live offset, the only source of truth |

## Animated properties

- **Primary**: `scrollX` (from `useAnimatedScrollHandler`).
- **Derived**: active-dot width/opacity, per-card `scale`/`opacity`, any parallax on card art.

## Motion model

⭐ **The indicator is derived from the OFFSET, not from a page event.** `onMomentumScrollEnd` fires
after the motion is over, so a dot driven by it always arrives late and the whole thing feels cheap.
Driving it from `scrollX` makes the dot travel WITH the finger:

```
progress = scrollX / pageWidth        // 1.4 means "40% of the way to page 2"
dotWidth = interpolate(progress, [i-1, i, i+1], [6, 20, 6], CLAMP)
```

⭐ **Two carousels on one screen** (the reference stacks features over plans): each needs its own
`ScrollView` with `directionalLockEnabled` and, if either sits inside a vertical scroll, an explicit
`activeOffsetX([-10, 10])` on the outer gesture. Otherwise a diagonal swipe is claimed by whichever
handler wakes first and the screen feels possessed.

## Spring/easing configuration

`.spring(response: 0.25, dampingFraction: 0.72)` → ω₀ = 25.13 →
`{ mass: 1, stiffness: 632, damping: 36.2 }`

⭐ **The fastest spring of the five studied** (`timing: fast`). Note the pattern across the set: ζ
stays around 0.72 for anything that must feel *premium*; what changes between "premium sheet" and
"premium carousel" is stiffness — 195 vs 632. **Damping is the character; stiffness is the tempo.**

Stagger: **0** — explicitly none.

## Gesture behavior

Native paging (`pagingEnabled` or `snapToInterval` + `decelerationRate="fast"`) carries the finger;
the spring above governs the settle when snapping programmatically (e.g. tapping a dot).

## Entry behavior

Cards are already in place; only the first card's content staggers in. The carousel itself does not
animate on mount.

## Exit behavior

None — it is a persistent control, not a transient.

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"`; only `spring` and `slide` came back, both generic.

### Ours

`Animated.ScrollView` + `useAnimatedScrollHandler` writing `scrollX`, then `useAnimatedStyle` per
consumer. No state, no re-render on scroll.

## Do

- Derive everything from `scrollX`.
- `decelerationRate="fast"` with `snapToInterval`.
- `directionalLockEnabled` on stacked carousels.
- Keep `mass` explicit; this spring is stiff and mass 4 would ruin it.

## Don't

- ❌ Drive the indicator from `onMomentumScrollEnd`.
- ❌ `useState` for the current page if it only feeds animation.
- ❌ Nest two horizontal scrollables without offset guards.

## Accessibility / Reduce Motion

Paging itself is the gesture and stays. Reduce Motion should drop the parallax and card scaling,
keeping the snap. Expose real `accessibilityRole="adjustable"` semantics so the carousel is
operable without swiping.

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh snap-carousel-spring
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | SNAP_BACK (the fastest spring in the library) |
| [`src/components/snap-carousel.tsx`](src/components/snap-carousel.tsx) | `useCarouselOffset` + the paged scroller |
| [`src/components/page-dots.tsx`](src/components/page-dots.tsx) | dots derived from the live offset |
| [`src/components/example-usage.tsx`](src/components/example-usage.tsx) | how the three wire together |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh flighty snap-carousel-spring
```

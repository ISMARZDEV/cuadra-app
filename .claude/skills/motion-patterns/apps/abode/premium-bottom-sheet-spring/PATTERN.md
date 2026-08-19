---
name: motion-premium-bottom-sheet-spring
description: >
  Reusable motion pattern: a panel anchored to the bottom edge that enters on a spring, staggers its
  content in, and can be dragged and dismissed by the finger — with the scrim DERIVED from the
  panel's position rather than animated in parallel. Reanimated 4 + Gesture Handler + TypeScript,
  physics converted from a real iOS reference (4 apps triangulated). Ships working `src/` files.
  Trigger: building or tuning any bottom sheet, action sheet, drag-to-dismiss panel, confirmation
  sheet, or contextual detail panel in an Expo/React Native app; or when a sheet feels like it
  "cuts" on release, its backdrop desyncs from the panel, or a flick fails to dismiss it.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: abode-invite-friends-pop-animation
---

> Distilled with the `60fps-to-reanimated` method. Reference clip and raw motion data in
> [reference/](reference/). **Working code in [src/](src/)** — typechecked, copy it, don't retype it.

## When to Use

- Confirmation, permission, share and invite sheets.
- Onboarding steps that do not deserve a full screen.
- Contextual detail over a list (product, event, profile).
- Pickers and filters that must keep the context behind visible.

## Description

The panel's position is the single source of truth. Everything else reads from it.

## Trigger

Mount (`visible → true`) for the entry. For dismissal, three paths **all ending in the same
animation**: drag past the threshold, tap the scrim, or a button.

## Initial state

| Shared value | At rest | Note |
|---|---|---|
| `translateY` | `SCREEN_H` | ⭐ off-screen **from frame 0**, not from `onLayout` |
| `sheetH` | `0` | filled in on `onLayout` |
| `offsetY` | `0` | drag anchor |
| `progress` (content) | `0` | one per staggered child |

## Animated properties

- **Primary**: the panel's `translateY`. The only one that leads.
- **Derived**: scrim `opacity`; each child's `opacity` + `translateY` + `scale`.
- `transform` and `opacity` only. Never `height` or `bottom` per frame.

## Motion model

A mass hanging from a spring anchored at `y = 0`. While the finger is down the spring disconnects
and position **tracks the finger 1:1**; past the top edge, rubber-banding appears so the panel never
detaches from the edge. On release the spring reconnects **inheriting the finger's velocity** and
picks its destination by distance OR velocity. The scrim is a reading of where the panel is.

## Spring/easing configuration

`stiffness = mass·ω₀²`, `damping = 2ζ·mass·ω₀`, `ω₀ = 2π/response`, `mass = 1`.

| Use | Source SwiftUI | ω₀ | Reanimated |
|---|---|---|---|
| Entry / return | `.spring(response: 0.45, dampingFraction: 0.72)` | 13.96 | `{ mass: 1, stiffness: 195, damping: 20.1 }` |
| Staggered content | `.spring(response: 0.55, dampingFraction: 0.58)` | 11.42 | `{ mass: 1, stiffness: 131, damping: 13.3 }` |
| Exit | `.spring(response: 0.35, dampingFraction: 0.85)` | 17.95 | `{ mass: 1, stiffness: 322, damping: 30.5 }` |

Stagger: **90 ms** per index. ⭐ `mass` explicit — Reanimated 4 defaults to `4`, not `1`.

## Gesture behavior

- **1:1 tracking** downward; rubber-banding upward (coefficient `0.55`).
- **Two thresholds OR'd**: distance `> 25%` of height **or** velocity `> 800 px/s`. Distance alone
  means a short fast flick fails to dismiss — that is what breaks the feel.
- ⭐ **Handoff via `velocity: e.velocityY`** on both destinations.
- `.activeOffsetY([-12, 12])` so an inner scroll view keeps its gesture.

## Entry behavior

From `sheetH` to `0` with the entry spring, fired once from `onLayout`. Content follows staggered.

## Exit behavior

**Deliberately asymmetric.** The entry invites (ζ 0.72); the exit obeys (ζ 0.85, faster). A
dismissal that bounces reads as "it did not want to leave". `onClose` fires in the spring callback,
only if `finished`.

## Implementation

### Reference SwiftUI — NOT implemented

Only the motion block is kept; the `.task { while !Task.isCancelled { … } }` preview loop and the
illustration `Path`s are dropped.

```swift
// TECHNICAL REFERENCE ONLY.
@State private var animationStep: Int = 0

IllustrationView().scaleEffect(animationStep >= 1 ? 1.0 : 0.2).opacity(animationStep >= 1 ? 1 : 0)
HeaderBlock().offset(y: animationStep >= 2 ? 0 : 35).opacity(animationStep >= 2 ? 1 : 0)
ActionButtons().offset(y: animationStep >= 3 ? 0 : 55).opacity(animationStep >= 3 ? 1 : 0)

withAnimation(.spring(response: 0.55, dampingFraction: 0.58)) { animationStep = 1 }
withAnimation(.spring(response: 0.50, dampingFraction: 0.72)) { animationStep = 2 }
withAnimation(.spring(response: 0.55, dampingFraction: 0.65)) { animationStep = 3 }
```

**Taken**: the sequence (illustration → text → actions), overshoot via scale, growing offset per
block (35 → 55), the spring constants.
**Discarded**: `animationStep: Int` (each piece owns its progress here), the loop, the view tree.

### Ours — Reanimated 4

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | the three converted configs + `STAGGER_MS` |
| [`src/motion/rubber-band.ts`](src/motion/rubber-band.ts) | the resistance worklet |
| [`src/components/premium-bottom-sheet.tsx`](src/components/premium-bottom-sheet.tsx) | panel + gesture + scrim |
| [`src/motion/use-stagger-in.ts`](src/motion/use-stagger-in.ts) | per-child staggered entry |

## Configuration

| Prop | Type | Default | What it changes |
|---|---|---|---|
| `dismissRatio` | `number` | `0.25` | How far to drag. Raise for destructive sheets |
| `dismissVelocity` | `number` | `800` | px/s that dismiss without distance |
| `SHEET_ENTER` | `WithSpringConfig` | ζ 0.72 | Softness of the entry |
| `SHEET_EXIT` | `WithSpringConfig` | ζ 0.85 | Dryness of the exit |
| `STAGGER_MS` | `number` | `90` | Gap between pieces. `0` = all at once |

## Do

- Derive the scrim from the panel's `translateY`.
- Pass `velocity: e.velocityY` on both `onEnd` destinations.
- Distance **OR** velocity threshold, never distance alone.
- Explicit `mass` in every `WithSpringConfig`.
- Wrap the app in `<GestureHandlerRootView style={{ flex: 1 }}>`.
- Clamp opacity and let transforms overshoot — that is where the pop lives.

## Don't

- ❌ Animate the scrim in parallel with the panel.
- ❌ Animate `height`, `bottom` or `top` per frame.
- ❌ `runOnJS` inside `onUpdate` — only in the spring callback.
- ❌ A shared `animationStep` with `>= n` comparisons.
- ❌ Chained `setTimeout` to stagger — use `withDelay`.
- ❌ Call `onClose` without checking `finished`.
- ❌ Import `SpringConfig` — the exported type is `WithSpringConfig`.

## Accessibility / Reduce Motion

`useReducedMotion()` governs **automatic transitions only**. ⭐ **The drag is NOT disabled** —
following the finger is direct response, not decoration. With Reduce Motion on the panel still
tracks the finger; only its settle is drier. Add `accessibilityViewIsModal` and an
`accessibilityLabel` on the scrim.

## Example usage

```tsx
import Animated from 'react-native-reanimated';
import { PremiumBottomSheet } from './components/premium-bottom-sheet';
import { useStaggerIn } from './motion/use-stagger-in';

function InviteSheet({ onClose }: { onClose: () => void }) {
  const art = useStaggerIn(0);
  const copy = useStaggerIn(1);
  const actions = useStaggerIn(2);

  return (
    <PremiumBottomSheet onClose={onClose}>
      <Animated.View style={art}><Artwork /></Animated.View>
      <Animated.View style={copy}><Title /><Subtitle /></Animated.View>
      <Animated.View style={actions}><PrimaryButton /></Animated.View>
    </PremiumBottomSheet>
  );
}
```

## Commands

```bash
# Typecheck src/ against a real Expo project (and prove the harness can fail)
~/.claude/skills/60fps-to-reanimated/assets/verify.sh premium-bottom-sheet-spring
```

---
name: motion-reward-recap-stagger
description: >
  Reusable motion pattern: a results/summary screen where stat cards pop in one after another with
  bouncy springs while their numbers count up on the UI thread. Covers the non-obvious part — an
  animated counter cannot be a <Text>, it must be an animated TextInput driven by useAnimatedProps,
  or you pay a re-render per frame. Physics converted from a real iOS reference (5 apps triangulated).
  Trigger: building any reward, recap, results, score, streak or end-of-session summary screen; any
  staggered card reveal; or any number that must animate from one value to another at 60fps.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: duolingo-cards-spin-mascot-word-wizard-animation
  status: implemented — src/ typechecked
---

> Distilled with the `60fps-to-reanimated` method. The reference clip sits in this folder;
> the shot's raw motion data is in `../shot.json`. **Working code in [`src/`](src/)** —
> typechecked against `apps/mobile`. Copy it, don't retype it.

## When to Use

- End-of-session recaps: score, XP, streak, accuracy, time.
- Checkout or transfer confirmations that report figures.
- Dashboard KPI rows that animate on first paint.
- Any list of cards that should arrive as a cascade, not a block.

## Description

A short, transient celebration: N cards arrive in sequence with overshoot, and each card's number
travels from 0 to its value. It settles and stays settled.

## Trigger

Mount of the results screen. One-shot — it must NOT loop.

## Initial state

| Shared value | At rest |
|---|---|
| `progress[i]` | `0` — one per card |
| `count[i]` | `0` — one per animated number |

## Animated properties

- **Primary**: per-card `progress` (drives `opacity` + `translateY` + `scale`).
- **Independent**: per-number `count`, feeding an animated `TextInput` via `useAnimatedProps`.
- No shared counter across cards. Each piece owns its progress.

## Motion model

Cards are independent springs fired on a delay ladder. The counters are NOT springs — a number that
overshoots past its target and comes back reads as a bug, so counters use `withTiming`, and only the
card geometry springs.

⭐ That split is the whole insight: **the container bounces, the value does not.**

## Spring/easing configuration

`.spring(response: 0.45, dampingFraction: 0.5)` → ω₀ = 13.96 → `{ mass: 1, stiffness: 195, damping: 14.0 }`

Note this is the **same stiffness as a premium bottom sheet** (same `response: 0.45`) with only the
damping changed (14.0 vs 20.1). `springiness: bouncy` versus `subtle` is one number.

Stagger: **90 ms** per index. Counters: `withTiming(value, { duration: 600, easing: Easing.out(Easing.cubic) })`.

## Gesture behavior

N/A — nothing here is finger-driven.

## Entry behavior

`withDelay(index * 90, withSpring(1, POP))`, opacity clamped, transforms allowed to overshoot.

## Exit behavior

Usually none (the screen is dismissed wholesale). If needed, a fast symmetric fade — never a
reversed stagger, which reads as the screen "unbuilding".

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"` — no generated file. The stagger recipe returned:

```swift
// TECHNICAL REFERENCE ONLY.
ForEach(Array(items.enumerated()), id: \.offset) { i, item in
    ItemView(item)
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : 14)
        .animation(.spring(response: 0.45, dampingFraction: 0.5).delay(Double(i) * 0.09), value: shown)
}
```

⭐ The shot's `motion_behavior` declares `ticker` — and **no recipe covers it**. The counter is
entirely on us.

### Ours — the counter, which is the hard part

React Native cannot animate `<Text>` content from the UI thread. The only 60fps route:

```
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const props = useAnimatedProps(() => ({ text: String(Math.round(count.value)) }));
<AnimatedTextInput editable={false} animatedProps={props} value={String(initial)} />
```

`runOnJS` + `setState` per frame is the wrong answer: one re-render per frame.

## Do

- One `progress` per card; never a shared integer step.
- `withTiming` for numbers, `withSpring` for geometry.
- Clamp opacity, let scale/translate overshoot.
- Fire once. A recap that loops is an ad.

## Don't

- ❌ A spring on a counter — numbers must not overshoot.
- ❌ `setState` per frame to update a number.
- ❌ Reversed stagger on exit.

## Accessibility / Reduce Motion

`useReducedMotion()` → cards place instantly, counters jump to final value. The information must
never be gated behind the animation.

## Example usage

```tsx
const card = useStaggerIn(index);          // from motion-premium-bottom-sheet-spring
<Animated.View style={card}><StatCard /></Animated.View>
```

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh reward-recap-stagger
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | CARD_POP + STAGGER_MS + COUNT_DURATION_MS |
| [`src/motion/use-stagger-in.ts`](src/motion/use-stagger-in.ts) | per-card staggered entry with overshoot |
| [`src/components/animated-counter.tsx`](src/components/animated-counter.tsx) | the UI-thread counter (animated TextInput) |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh duolingo reward-recap-stagger
```

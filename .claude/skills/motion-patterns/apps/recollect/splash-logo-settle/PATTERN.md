---
name: motion-splash-logo-settle
description: >
  Reusable motion pattern: an app-launch splash that settles its logo and hands off to the first
  real screen as ONE continuous move, with the handoff gated on real readiness rather than on a
  fixed timer. Includes the honest constraint that React Native has no per-frame motion blur, and
  the two ways to fake convergence effects.
  Physics converted from a real iOS reference (5 apps triangulated).
  Trigger: building an app splash, launch sequence, logo intro, loading-to-content handoff, or any
  first-run screen that must cover work happening behind it.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: recollect-splash
  status: implemented — src/ typechecked
---

> Distilled with the `60fps-to-reanimated` method. The reference clip sits in this folder;
> the shot's raw motion data is in `../shot.json`. **Working code in [`src/`](src/)** —
> typechecked against `apps/mobile`. Copy it, don't retype it.

## When to Use

- App launch splash into onboarding or home.
- Logo intro before a first screen.
- Any "cover the boot" sequence.

## Description

The most-seen and least-considered animation in an app. It is a **cover for work**, not a showreel.

## Trigger

Cold launch. `gesture_or_trigger: system event`.

## Initial state

| Shared value | At rest |
|---|---|
| `clock` | `0` — the sequence timeline |
| `logoScale` | oversized (e.g. `1.4`) |
| `contentProgress[i]` | `0` |

## Animated properties

Logo `scale` + `translateY`; per-element `opacity`/`translateY` for the reveal.

## Motion model

Three beats: the logo **settles** (scales down into its final place), the background elements
**converge or clear**, then the first screen's content **reveals** staggered.

⭐ **The handoff is the whole pattern.** The logo's final position should be exactly where it lives
on the next screen, so the transition is one continuous move rather than a splash that disappears
and a header that appears.

⭐ **Gate on readiness, not on a timer.** `Promise.all([minimumDuration, appReady])` — the splash
lasts `max(animation, work)`. A fixed `setTimeout` either truncates the animation on a slow device
or wastes a second on a fast one. Pair with `expo-splash-screen`'s `preventAutoHideAsync`.

## Spring/easing configuration

⭐ **Not a spring** — `motion_params.easing` is `ease-in-out`, `timing: slow`:

```
withTiming(v, { duration: 700, easing: Easing.bezier(0.42, 0, 0.58, 1) })   // = SwiftUI .easeInOut
```

Stagger: **90 ms** (`pronounced`). Ease-in-out is right here: a splash is a *statement*, and the
symmetric acceleration reads as composed. A spring would make the brand mark look jittery.

## Gesture behavior

None. ⭐ But it must be **skippable/interruptible** — if the app is ready early, cut to content.
Never make a returning user watch the full show.

## Entry behavior / Exit behavior

Entry is the launch itself. Exit is the handoff — and it must be a **transition, not a fade-out**.

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"`; generic scale-pop / stagger / fade.

### The honest constraint

The reference's signature effect is cards streaming down with **vertical motion blur**, converging
into the logo. ⭐ **React Native has no per-frame motion blur.** Two options:

1. **Ghost trails** — 3-4 semi-transparent copies of each card offset along the travel axis and
   scaled on Y. Cheap, convincing at speed, pure Reanimated.
2. **Skia** — `@shopify/react-native-skia` with a real blur `ImageFilter` on a moving group. This
   repo already ships Skia (used for the shimmer), so it is available; it costs more per frame.

Start with ghost trails. Only reach for Skia if the effect carries the brand.

**Convergence** is the reusable primitive underneath: N elements interpolating from scattered start
points to one target while scaling to ~0 and fading — a "suction" that can serve save-to-collection,
add-to-cart, and delete animations too.

## Do

- Land the logo exactly where the next screen wants it.
- `max(minimumDuration, appReady)`, never a bare timer.
- Ghost trails before Skia.
- Keep it under ~1.2 s of *mandatory* time.

## Don't

- ❌ A fixed `setTimeout` for the handoff.
- ❌ Fade the splash out and fade the screen in — that is two moves where one belongs.
- ❌ Replay the full sequence on every warm start.
- ❌ Real per-frame blur expectations without Skia.

## Accessibility / Reduce Motion

⭐ `useReducedMotion()` → show the logo statically for the minimum readiness window and cut straight
to content. A splash is the safest place to remove motion entirely: nothing is lost.

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh splash-logo-settle
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/timing.ts`](src/motion/timing.ts) | ease-in-out curve + the visibility floor |
| [`src/motion/use-splash-handoff.ts`](src/motion/use-splash-handoff.ts) | max(minimum, appReady) — never a bare timer |
| [`src/components/splash-sequence.tsx`](src/components/splash-sequence.tsx) | logo settle + staggered reveal |
| [`src/components/ghost-trail.tsx`](src/components/ghost-trail.tsx) | fake motion blur without Skia |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh recollect splash-logo-settle
```

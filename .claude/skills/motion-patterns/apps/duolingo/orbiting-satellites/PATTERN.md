---
name: motion-orbiting-satellites
description: >
  Reusable motion pattern: N elements circling a centre on an elliptical path with fake 3D depth,
  looping forever. Driven by ONE shared clock with each satellite deriving its position — never one
  animation per satellite. Depth (scale, opacity, z-order) falls out of sin(theta) for free.
  Physics converted from a real iOS reference (4 apps triangulated).
  Trigger: building a looping hero/idle animation where items orbit a logo, mascot or centrepiece;
  a splash or onboarding centrepiece; a 3D-ish ring or carousel of icons; any continuous ambient
  motion that must not cost a frame.
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

- Splash / onboarding centrepieces (logo with satellites).
- "Integrations" or "works with" showcases.
- Empty states that need life without demanding attention.
- Any ambient loop behind a centred subject.

## Description

Continuous, never settles, never interactive. It is scenery.

## Trigger

Mount. Loops until unmount. ⭐ Must pause when the screen loses focus — an infinite animation on a
backgrounded screen is a battery bug.

## Initial state

| Shared value | At rest |
|---|---|
| `clock` | `0` → runs to `1`, repeating |

**One** shared value for the whole system, regardless of satellite count.

## Animated properties

Per satellite, all DERIVED from `clock`: `translateX`, `translateY`, `scale`, `opacity`, `zIndex`.

## Motion model

```
θ  = (clock + i / N) · 2π          ← index becomes phase offset
x  = cos(θ) · rx
y  = sin(θ) · ry                   ← ry < rx is what makes it an ellipse
d  = (sin(θ) + 1) / 2              ← 0 = far, 1 = near
scale   = lerp(0.6, 1.0, d)
opacity = lerp(0.45, 1.0, d)
zIndex  = round(d * 100)
```

⭐ **The fake 3D is free.** The satellite "behind" is simply the one whose `sin(θ)` is negative;
draw it smaller and dimmer and the eye supplies the depth. No 3D transforms, no perspective matrix.

⭐ **One clock, N derivations.** N animations would drift apart and cost N times as much.

## Spring/easing configuration

**Not a spring.** A perpetual orbit must be perfectly linear or the loop seam becomes visible:

```
withRepeat(withTiming(1, { duration: 8000, easing: Easing.linear }), -1, false)
```

Any easing makes each revolution speed up and slow down, which reads as a stutter once per lap.

## Gesture behavior

N/A by default. If made interactive, the clock becomes a gesture-driven offset and the loop is
re-seeded from the release velocity via `withDecay`.

## Entry behavior

Satellites fade/scale in staggered while the clock is already running — the orbit should feel like
it was always turning and we just arrived.

## Exit behavior

Fade the whole system as one. Never stop the clock first; a frozen orbit looks broken.

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"`. ⭐ The shot declares `orbit` and `rotate` in `motion_behavior` and **not one
recipe covers either** — the returned snippets were the generic spring/scale/stagger/fade set. This
pattern is 100% ours; 60fps supplied the intent and the look, nothing else.

### Ours

`useDerivedValue` per satellite reading the single `clock`. `useAnimatedStyle` consuming it. Zero
JS-thread work after mount.

## Do

- One clock, N `useDerivedValue`.
- `Easing.linear` — always, for perpetual loops.
- Pause on blur (`useIsFocused` / `AppState`).
- `ry < rx` — a circle reads flat, an ellipse reads 3D.

## Don't

- ❌ One `withRepeat` per satellite.
- ❌ Any easing on a perpetual loop.
- ❌ Real 3D transforms for this — unnecessary cost.
- ❌ Leave it running off-screen.

## Accessibility / Reduce Motion

⭐ `useReducedMotion()` → **stop the orbit entirely** and lay the satellites out statically around
the centre. This is pure decoration, so it is exactly what Reduce Motion is for. Unlike a drag,
nothing is lost by removing it.

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh orbiting-satellites
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/use-orbit-clock.ts`](src/motion/use-orbit-clock.ts) | the ONE clock — linear, repeating, pausable |
| [`src/components/orbit.tsx`](src/components/orbit.tsx) | Orbit + OrbitSatellite, all positions derived |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh duolingo orbiting-satellites
```

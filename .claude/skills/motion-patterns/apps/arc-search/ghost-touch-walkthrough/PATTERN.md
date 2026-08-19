---
name: motion-ghost-touch-walkthrough
description: >
  Reusable motion pattern: a scripted tutorial where a fake fingertip performs gestures on a
  simulated UI — long-press, tap, drag — and the interface responds as if a real user were driving
  it. Built as ONE master clock with every actor interpolating its own keyframes, never as chained
  setTimeouts, so it can pause, rewind, loop and stay off the JS thread.
  Physics converted from a real iOS reference (5 apps triangulated).
  Trigger: building a "how to add our widget" screen, a feature walkthrough, a simulated gesture
  demo, an animated tutorial, or any auto-playing sequence that must show the user what to do.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: arc-search-add-widget-animation
  status: implemented — src/ typechecked
---

> Distilled with the `60fps-to-reanimated` method. The reference clip sits in this folder;
> the shot's raw motion data is in `../shot.json`. **Working code in [`src/`](src/)** —
> typechecked against `apps/mobile`. Copy it, don't retype it.

## When to Use

- "How to add our widget" — the near-universal one.
- Onboarding that teaches a gesture (swipe, long-press, drag).
- Feature demos where a real interaction is impossible or slow.
- Empty states demonstrating what the user could do.

## Description

A film, not a control. Nobody touches anything — the point is watching.

## Trigger

Tap on a "Show me how" button, or autoplay on mount. Loops with a pause between runs.

## Initial state

| Shared value | At rest |
|---|---|
| `clock` | `0` — milliseconds of the timeline |
| `pointer{X,Y}` | start position |
| `pressed` | `0` |
| `wigglePhase[i]` | random, fixed once per icon |

## Animated properties

Pointer `translateX/Y` + `scale` (press), per-icon `rotate` (wiggle), sheet `translateY`, step-label
`opacity`.

## Motion model

⭐ **One master clock, every actor derives.** The script is DATA:

```ts
const SCRIPT = [
  { at: 0,    move: { x: 180, y: 420 } },
  { at: 600,  press: true },      // long-press begins
  { at: 1400, wiggle: true },     // icons enter jiggle mode
  { at: 2000, move: { x: 40, y: 90 } },
  { at: 2600, tap: true },
  { at: 2800, sheet: 1 },
];
```

`clock` runs `withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear })` and each actor
`interpolate`s the clock against its own keyframe arrays. This is why chained `setTimeout` is the
wrong answer: it cannot rewind, cannot pause, cannot scrub, and lives on the JS thread.

⭐ **The wiggle needs a RANDOM PHASE PER ICON.** iOS jiggle is not synchronised. If every icon
rotates in lockstep the eye catches it instantly and the whole tutorial reads as a cheap GIF. One
`phase` per icon, fixed at mount, fed into the repeat.

## Spring/easing configuration

⭐ **Not a spring** — `motion_params.easing` is `ease-out`:

```
withTiming(v, { duration: 450, easing: Easing.bezier(0, 0, 0.58, 1) })   // = SwiftUI .easeOut
```

Here `duration` is literal; the 1.5× perceptual rule is spring-only.
Stagger between steps: **40 ms** (`stagger: subtle`).
Wiggle: `withRepeat(withSequence(timing(-2°), timing(+2°)), -1, true)`, period ≈ 120 ms.

## Gesture behavior

⭐ **There is none, and that is the design.** `gesture_or_trigger` says `tap` — the tap that starts
the film. Everything after is choreography. Do not add drag handling; it invites the user to fight a
recording they cannot steer.

The one real interaction worth having: **tap anywhere to skip/restart.**

## Entry behavior / Exit behavior

Symmetric fade of the whole stage. Individual actors never enter separately — the stage is one object.

## Implementation

### Reference SwiftUI — NOT implemented

`source: "recipes"`; the returned snippets were the generic scale-pop / stagger / slide / fade /
mask-reveal set. ⭐ The shot declares `wiggle` and **no recipe covers it**.

### Ours

`clock` shared value + one `useDerivedValue` per actor + `interpolate` over keyframe arrays.
The sheet slide-up can reuse `motion-premium-bottom-sheet-spring`, swapping the spring for the
ease-out above.

## Do

- Script as data; clock as the only driver.
- Random wiggle phase per icon.
- Tap-to-skip.
- Pause on blur; loop with a real gap between runs.

## Don't

- ❌ Chained `setTimeout` / `useEffect` ladders.
- ❌ Synchronised wiggle.
- ❌ Real gesture handling on a simulated surface.
- ❌ Copy the OS's icons, brand or artwork — draw neutral stand-ins.

## Accessibility / Reduce Motion

⭐ `useReducedMotion()` → **replace the film with the storyboard**: the same steps as static frames
with captions, advanced by a button. The instructions must survive the loss of the animation, since
here the animation IS the content.

## Commands

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh ghost-touch-walkthrough
```

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/timeline.ts`](src/motion/timeline.ts) | keyframe tracks + worklet-safe `valueAt` |
| [`src/motion/use-timeline.ts`](src/motion/use-timeline.ts) | the master clock in milliseconds |
| [`src/motion/use-wiggle.ts`](src/motion/use-wiggle.ts) | jiggle with random phase per icon |
| [`src/components/ghost-pointer.tsx`](src/components/ghost-pointer.tsx) | the fake fingertip |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh arc-search ghost-touch-walkthrough
```

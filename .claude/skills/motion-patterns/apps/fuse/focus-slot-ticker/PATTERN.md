---
name: motion-focus-slot-ticker
description: >
  Reusable motion pattern: a column of items rolls one step at a time through a FIXED focus slot,
  and whatever lands in the slot is promoted — full opacity, full scale, indented for its own mark
  — while its neighbours stay near-invisible ghosts. Status is a function of distance from the
  slot, not a separate animation, so it can never desynchronise from the travel.
  Reanimated 4 + TypeScript.
  Trigger: an onboarding screen cycling value propositions, an empty state suggesting what the app
  can do, a status column showing one live item at a time — any short list that must present itself
  one member at a time without the user doing anything.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: fuse (60fps MCP `generated` + measured video)
  evidence: corroborated
---

> **Working code in [`src/`](src/)** — typechecked against `apps/mobile` with a failing canary.

## 60fps reference

| | |
|---|---|
| **Shot** | `fuse-intro-value-prop-cycle-animation` — https://60fps.design/shots/fuse-intro-value-prop-cycle-animation |
| **Clip** | [`focus-slot-ticker.mp4`](focus-slot-ticker.mp4) — in this folder. **Watch it**; keyframes are 1 s apart |
| **Raw data** | [`../shot.json`](../shot.json) · [`../SHOT.md`](../SHOT.md) |
| **`source`** | `generated` — there IS a compile-checked Swift file, and it was worth opening |
| **`animation`** | `.spring(response: 0.45, dampingFraction: 0.72)` — **superseded by measurement** |
| **`stagger_delay`** | `0` (legitimately: `motion_params.stagger` is `none`) |
| **Evidence** | `corroborated` — see the checklist at the end |

### ⭐ Three sources of numbers, three answers

This shot is the textbook case of the method's warning that the metadata and the generated file
disagree — here they disagree with each other *and* with the video:

| Source | Spring | Cadence | Row pitch | Resting opacity |
|---|---|---|---|---|
| `animation` field | response 0.45 · ζ 0.72 | — | — | — |
| generated Swift | response 0.58 · ζ 0.68 | 2100 ms | 52 pt | 0.28 |
| **measured video** | **response 0.34 · ζ 0.82** | **1540 ms** | **70 pt** | **0.09** |

The video is the judge. But the Swift file is not as wrong as the table makes it look: it applies
opacity **twice** — the row at 0.28 and the label's colour at 0.28 — and 0.28 × 0.28 = 0.078,
which is what the frames actually measure. Read the whole file before calling a number wrong.

### ⭐ What the reference metadata got wrong

- It says the arriving item *"transitions to its brand color"*. It does not: the **label** goes from
  a light grey to near-black, and the only thing that carries colour is the **mark**. Implementing
  the sentence would have produced a screen of coloured words, which is a different design.
- It reports `timing: medium`. Measured response is 0.34 s, which this method's table reads as
  `fast`. `shot.json` records the measurement.

### ⭐ The segmenter could not see this animation

Worth recording because it will happen again on any clip framed as a device mockup: the segmenter
found **2 motion windows in a clip with 5 transitions**, and the one real window contained 18
static frames and stopped before the motion finished. The moving text is a few dozen pixels inside
a 2000 px frame, so the per-frame scene score never clears the threshold.

The fix was not a lower threshold — it was a **whole-clip kymograph of the ticker band**, one
averaged column per frame. That single image gave all five step onsets, the cadence and the travel
at once. When the motion is a small part of a large frame, crop first and measure the crop.

## Description
A short list presents itself one member at a time by rolling through a fixed slot. The slot is the
component; the list is its data.

## Use cases
1. **Onboarding value propositions** — the source case.
2. **An empty state** cycling what the user could do here.
3. **A status column** showing one live item at a time (syncing, matching, importing).

## Trigger
`system event` — a metronome. Nothing is finger-driven.

## Initial state
`slot = 0`. Row 0 is in the focus slot at full opacity, scale 1, indented by `indent`, mark shown.
Every other row is at its own offset, 0.84 scale, ~9% opacity, no mark, no indent.
On **frame 0** this must already be true — a ticker that fades up from nothing on mount reads as a
loading state, not as a list.

## Animated properties
| Property | Role |
|---|---|
| `slot` | **PRIMARY** — the only driver. Continuous position in item-index space |
| `translateY` | DERIVED — `signedDistance × rowPitch` |
| `opacity` | DERIVED — `[0, 1, 2] → [1, 0.09, 0]` on \|distance\| |
| `scale` | DERIVED — `[0, 1] → [1, 0.84]` on \|distance\| |
| `translateX` (label) | DERIVED — `focus × indent` |
| `opacity` + `scale` (mark) | DERIVED — from `focus` |

Transforms and opacity only. Nothing here triggers layout.

## Motion model
One shared value leads and six properties follow. The rows are **static React elements** — the text
never changes, only the column moves — so nothing crosses the JS bridge while the animation runs.

The signed distance is wrapped into a ring, so rows recycle around the back rather than running
off. The recycle jump happens at a distance where the row is already fully transparent, which is
why it is never seen, and why the component needs **at least 4 items** for it to stay hidden.

⭐ **Status is read off position; it is not animated in parallel.** This is the whole trick. Four
separate animations for opacity, scale, indent and mark would need identical curves to stay in
step, and would drift the moment one of them was tuned.

## Spring/easing configuration

```
MEASURED   travel 136 px (70 pt) · onset→settle ~300 ms · overshoot 1-2 px (~1.2%)

ζ  = −ln(M) / √(π² + ln²(M)),  M = 0.012        → 0.82
ω₀ = (π / t_peak) / √(1 − ζ²)                    → 18.5 rad/s
response = 2π / ω₀                               → 0.34 s

stiffness = mass · ω₀²        = 1 · 18.5²        = 341
damping   = 2 · ζ · mass · ω₀ = 2 · 0.82 · 18.5  = 30.4
```

```ts
export const SLOT_SPRING: WithSpringConfig = { mass: 1, stiffness: 341, damping: 30.4 };
```

⭐ `mass` is **explicit**. Reanimated 4 defaults to `mass: 4` (verified in `springConfigs.d.ts`),
so omitting it quadruples the inertia and none of the arithmetic above survives.

⭐ **A stepped loop is not perpetual motion.** The library's rule is that anything looping forever
must be `Easing.linear` or it seams once per lap. That rule governs *continuous* motion — a
marquee, an orbit. This loops forever but **moves in discrete transients separated by a 1240 ms
dwell**, and a transient that arrives gets a spring. The metronome is the loop; the step is the
animation. Keeping those two separate is what stops it reading as a slot machine.

⭐ **ζ 0.82 sits deliberately above the library's 0.72 "premium arrival" signature.** The thing
arriving is a **word someone is about to read**, and text that wobbles into place reads as broken.
This lands between `arrival` (0.72) and `container that resizes around text` (0.86-1.0), which is
exactly where a *word* that arrives belongs.

## Gesture behavior
N/A — and that is the right call. This is an idle, unattended loop; there is nothing to grab. If a
finger ever needs to scrub it, `slot` is already a continuous shared value in item-index space, so
a pan would drive it directly and hand off with `withSpring(target, { ...SLOT_SPRING, velocity })`.

## Entry behavior
Mounted at rest, already settled. See *Initial state*.

## Exit behavior
Symmetric by construction, and not by choice: leaving is the same distance function run backwards.
There is no separate exit to tune, which is the point of deriving status from position.

## Implementation

### Reference SwiftUI — NOT implemented
Taken: the `relativeSlot(itemIndex:step:total:)` idea — a signed, wrapped distance from the focus
slot — and the insight that every visual property is a function of it.

Discarded: the `.task { while !Task.isCancelled { … Task.sleep … } }` preview loop; the hand-drawn
gradient aura and 4-dot brand mark; all of its copy and palette; its numbers (see the table above);
and its approach of animating the icon's `frame(width:)`, which would be a layout pass per frame.

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/timings.ts`](src/motion/timings.ts) | Every measured constant, with the arithmetic and the honest error bars |
| [`src/motion/use-focus-slot.ts`](src/motion/use-focus-slot.ts) | The single driver + the wrapped-distance worklet |
| [`src/components/focus-slot-ticker.tsx`](src/components/focus-slot-ticker.tsx) | The component, the rows, and the Reduce Motion variant |
| [`src/components/example-usage.tsx`](src/components/example-usage.tsx) | The smallest thing that works |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh fuse focus-slot-ticker
```

## Configuration
| Prop | Type | Default | What it changes |
|---|---|---|---|
| `items` | `readonly FocusSlotItem[]` | — | The ring. **At least 4** so the recycle stays hidden |
| `rowPitch` | `number` | `70` | Row spacing, and therefore the travel of one step |
| `periodMs` | `number` | `1540` | Metronome. ~300 ms of it is travel, the rest is reading time |
| `indent` | `number` | `50` | How far the label slides right to clear its mark |
| `restingOpacity` | `number` | `0.09` | What a neighbour is worth |
| `restingScale` | `number` | `0.84` | How much smaller a neighbour is |
| `markFocusRange` | `number` | `0.75` | How close a row must be before its mark appears. **Inferred, not measured** |
| `markSize` | `number` | `28` | Mark box at the row's fixed left edge |
| `renderMark` | `(item, index) => ReactNode` | — | Your mark. Called in **render**, never in a worklet |
| `onIndexChange` | `(index: number) => void` | — | Commit point — fires once per step, not per frame |

## Do
- Keep the dwell long. The movement is 300 ms; the other 1240 ms is the product.
- Let every visual property derive from `slot`.
- Give it at least 4 items.
- Put analytics or haptics on `onIndexChange`, which fires once per step.

## Don't
- Don't animate the mark's width to open the gap — translate the label instead.
- Don't raise the bounce. This is text being read, not a toy.
- Don't animate opacity, scale and position as three parallel animations.
- Don't pass `renderMark` — or any function — into a worklet.
- Don't omit `mass` after using the formula.

## Accessibility / Reduce Motion
⭐ The column is decoration and decoration stops — but the labels **only exist because of the
animation**, so switching it off entirely would delete the content. The implemented compromise:
under `useReducedMotion()` the component renders **one row, in place, crossfading** on the same
cadence. Nothing travels, nothing scales, and everything it had to say still gets said.

For screen readers the ticker is a **single element labelled with all of its items at once**
(`accessible` + a joined `accessibilityLabel`, rows hidden from the tree). Chasing a moving row
would be worse than useless.

## Example usage
See [`src/components/example-usage.tsx`](src/components/example-usage.tsx).

## Corroboration checklist (SKILL.md §5)

1. **Does the mechanism survive stripping the app?** Yes. Remove the fintech words and the coloured
   icons and a fixed focus slot with content rolling through it remains.
2. **Does its physics land inside the library's priors?** Yes, with a written reason: ζ 0.82 sits
   between *arrival* (0.72) and *container around text* (0.86-1.0), which is where a word that
   arrives belongs. One driver, N derivations. The apparent conflict with "perpetual motion is
   linear" is resolved above — this is a stepped transient, not continuous motion.
3. **Three different screens?** Onboarding value props · an empty state · a live status column.
4. **Is the parameterisation real?** Yes — items, pitch, period, indent, resting opacity/scale,
   mark renderer. The structure never changes.
5. **What would falsify it?** If other apps that cycle words do it as an in-place crossfade with no
   visible neighbours — the way [`../../recollect/rolling-word-swap`](../../recollect/rolling-word-swap/PATTERN.md)
   does — then the visible ghost column is this app's signature rather than a convention, and this
   drops to `single-source`.

⭐ `library.py triangulate` suggested `confirmed`, and it was **rejected**. Its overlap came from
`onboarding`, which is a product context rather than a mechanism, and from generic verbs
(`fade`, `scale`, `slide`) shared with a bottom sheet and a tutorial. The nearest neighbour in the
library, `brilliant/traveling-selection-indicator`, is the **inverse** mechanism: there the
indicator travels to the item; here the items travel to a fixed indicator. Sharing verbs is not
sharing a mechanism — the tool says so itself.

## Not to be confused with
[`../../recollect/rolling-word-swap`](../../recollect/rolling-word-swap/PATTERN.md) also cycles
words on a timer, and is a **different pattern**: it swaps a single word inside a settled line,
crossfading at the midpoint so the change is never seen, with no neighbours visible at all. Here
three rows are visible at once and the column moves as one body. Use that one to change a word
inside a sentence; use this one to present a list one member at a time.

---
name: motion-pill-to-panel-expansion
description: >
  Reusable motion pattern: a compact control that BECOMES a full panel in place and returns —
  one object growing, never a pill that hides while a separate panel appears. The backdrop stays
  mounted and recedes with blur plus a small scale-down, so the context is set aside rather than
  replaced. Notable for its INVERTED asymmetry: the collapse is deliberately 1.5x slower than the
  expansion, because closing hands the user's context back. Reanimated 4 + TypeScript.
  Trigger: building a search entry point, a filter bar that opens into a form, a compose control,
  an inline expanding card, or any compact affordance that must grow into a working surface —
  and whenever an expanding control feels like two things crossfading instead of one thing growing.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: airbnb (user-supplied clip, no MCP)
  evidence: corroborated
---

> Distilled with the `60fps-to-reanimated` method **without the 60fps MCP** — from a clip the user
> supplied. Reference and raw data in this folder and in [`../shot.json`](../shot.json).
> **Working code in [`src/`](src/)** — typechecked against `apps/mobile`.

## Reference

| | |
|---|---|
| **Source** | user-supplied clip, `Airbnb.mp4` (2160×2160, 8.8s, 60fps) |
| **Frames** | [`frames/`](frames/) — 1080px, only inside the motion windows |
| **`source`** | `manual` — no MCP metadata, everything below is MEASURED |
| **Evidence** | `corroborated` (single clip; see the checklist at the end) |

⭐ **There is no SwiftUI reference section here**, and that is the point: this pattern was distilled
from frames alone. Nothing was lost — the physics below is measured rather than reported, which is
strictly more reliable than a `springiness: "subtle"` label.

### Measured motion windows

`segment-motion.py` found two, out of 8.8s of runtime:

| Window | Span | Duration | What happens |
|---|---|---|---|
| `w1_03050-03467ms` | 3050 → 3467 ms | **417 ms** | pill expands into the panel |
| `w2_06367-07000ms` | 6367 → 7000 ms | **633 ms** | panel collapses back to the pill |

Everything else is static. 94% of the clip's frames were near-identical to the one before.

## Description

A compact control grows in place into a working surface, and shrinks back. The screen behind is
never replaced — it recedes.

## Use cases

- A search entry point that opens into a full query builder.
- A filter bar that becomes a filter form.
- A compose/reply affordance that expands into an editor.
- An inline card that opens into its own detail without navigating.

## Trigger

`tap` on the collapsed control. Closing: tap the close affordance, or tap the receded backdrop.

## Initial state

| Shared value | At rest | Note |
|---|---|---|
| `progress` | `0` | the single driver for the whole system |

⭐ One shared value. Panel height, panel inset, content opacity, pill-label opacity, backdrop scale,
backdrop opacity and blur radius are all `interpolate` reads of it, so they cannot desynchronise.

## Animated properties

- **Primary**: `progress` (0 → 1).
- **Derived**: panel `height` + `marginHorizontal`; content `opacity`; pill label `opacity`;
  backdrop `scale` + `opacity`; blur radius.

⭐ **This pattern animates `height`, which the library's own quality bar forbids per frame.** It is
a deliberate exception, and the reason is that the panel must *reflow* its contents as it grows —
a `scaleY` would stretch the text inside it, which is exactly the artefact this pattern exists to
avoid. Keep the panel's subtree shallow and its children absolutely positioned so the layout pass
stays cheap. If the contents are complex enough that this drops frames, the honest fix is a
fixed-height panel with a masked reveal, not a stretched one.

## Motion model

The pill and the panel are **the same view**. It grows from the collapsed height to the expanded
height while its horizontal inset goes to zero, and the two content layers crossfade on
non-overlapping windows so neither is ever visible on top of the other.

The backdrop is not a scrim. It **blurs and scales down to 0.94** — blur alone reads as a filter;
blur plus a small recession reads as depth, as the feed stepping back to let the panel through.
It also stays mounted: unmounting would lose scroll position and force a re-render on close, which
is the opposite of handing the context back.

## Spring/easing configuration

Derived from the measured window durations, with no visible overshoot in either direction.

| Use | Reanimated | ζ | Rationale |
|---|---|---|---|
| Expand (417 ms) | `{ mass: 1, stiffness: 224, damping: 25.7 }` | 0.86 | quick and certain; the user is about to type into it, so a panel that bounces past its size reads as unstable |
| Collapse (633 ms) | `{ mass: 1, stiffness: 98, damping: 19.8 }` | ~1.0 | softer and slower — see below |

Content crossfade: panel `[0.35, 0.85]`, pill label `[0, 0.25]`. Stagger ≈ 50 ms.

⭐ **The asymmetry is INVERTED relative to `premium-bottom-sheet-spring`**, and that contrast is the
most useful thing in this pattern. There, the exit was *drier and faster* than the entry, because a
dismissal should obey immediately. Here the exit is *softer and 1.5× slower*, because the panel is
putting the user's context back and the eye needs time to re-find the feed it left.

**The rule underneath both: exit speed follows what the exit MEANS.** Discarding should be fast.
Returning should not.

Note also that ζ here (0.86 / ~1.0) sits above the library's ζ≈0.72 "premium" signature. That is
consistent, not contradictory: 0.72 is the signature for things that *arrive*. A container that
resizes around text should not overshoot at all.

## Gesture behavior

None in the reference — it is tap-driven. A drag-to-dismiss could be layered on by feeding
`progress` from a pan and handing off with `velocity`, exactly as
`premium-bottom-sheet-spring` does. Do not add it speculatively: this control lives at the top of
a scrolling feed, where a vertical pan would fight the scroll view.

## Entry behavior

`withSpring(1, EXPAND)`. The panel arrives first, its content lands inside it.

## Exit behavior

`withSpring(0, COLLAPSE)`. Content fades before the box finishes shrinking, so the panel is empty by
the time it reaches pill size — it never looks like content was crushed.

## Implementation

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | the two measured configs + stagger + blur constants |
| [`src/motion/use-expansion.ts`](src/motion/use-expansion.ts) | the single driver and every derived style |
| [`src/components/expanding-panel.tsx`](src/components/expanding-panel.tsx) | the one-object panel, backdrop and layers |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh airbnb pill-to-panel-expansion
```

The blur layer is left to the caller via `renderBlur`, since the right implementation differs by
project (`expo-blur`, a Skia backdrop filter, or none at all). Feed it the `blurRadius` derived
value; do not animate blur on the JS thread.

## Configuration

| Prop | Type | Default | What it changes |
|---|---|---|---|
| `geometry.collapsedHeight` | `number` | — | the pill's height |
| `geometry.expandedHeight` | `number` | — | the panel's height |
| `geometry.collapsedInset` | `number` | `0` | horizontal inset of the pill vs the panel |
| `EXPAND` | `WithSpringConfig` | ζ 0.86 | certainty of the opening |
| `COLLAPSE` | `WithSpringConfig` | ζ ~1.0 | how gently the context comes back |
| `BACKDROP_BLUR` | `number` | `18` | maximum backdrop blur |

## Do

- Keep it ONE view that grows. Two views crossfading is the cheap version and it shows.
- Keep the backdrop MOUNTED; recede it, never unmount it.
- Blur **and** scale the backdrop — blur alone reads as a filter, not as depth.
- Give the collapse more time than the expansion.
- Non-overlapping crossfade windows for the two content layers.
- `accessibilityState={{ expanded }}` on the control.

## Don't

- ❌ Hide the pill and mount a separate panel.
- ❌ `scaleY` the panel instead of animating its height — it stretches the text inside.
- ❌ Unmount the screen behind.
- ❌ Let the panel overshoot: a container that resizes around text must not bounce.
- ❌ Animate blur radius from JS.
- ❌ Copy the reference app's copy, brand or assets.

## Accessibility / Reduce Motion

`useReducedMotion()` → `progress` snaps to its target; the panel appears at full size with no
growth and no blur ramp. Everything remains operable, because the layout at `progress = 1` is the
same either way.

⭐ The backdrop blur is decoration and should be dropped entirely under Reduce Motion — animated
blur is a common motion-sickness trigger. Keep the dimming, drop the ramp.

## Example usage

```tsx
const [open, setOpen] = useState(false);

<ExpandingPanel
  open={open}
  onOpen={() => setOpen(true)}
  onClose={() => setOpen(false)}
  geometry={{ collapsedHeight: 56, expandedHeight: 520, collapsedInset: 16 }}
  collapsed={<SearchPill />}
  expanded={<SearchForm onSubmit={() => setOpen(false)} />}
  backdrop={<Feed />}
  accessibilityLabel="Start your search"
/>
```

## Corroboration — why one clip is enough here

Single-source, so the five questions from SKILL.md §5:

1. **Does the mechanism survive stripping the app?** ✅ Remove the pink, the copy and the listings
   and what remains is *a compact control that becomes a panel while the context recedes*. Nothing
   about it is travel-specific.
2. **Does its physics land inside the library's priors?** ⚠️ Partly. One driver with N derivations:
   ✅. Transient motion springs: ✅. But ζ 0.86/1.0 sits above the ζ≈0.72 signature, and the
   entry/exit asymmetry is inverted. **Both have reasons, stated above** — a resizing container must
   not overshoot, and a return is not a dismissal. Recorded as a deliberate divergence, not a match.
3. **Three different screens?** ✅ Search entry, filter bar, compose control — none of them the
   source screen.
4. **Is the parameterisation real?** ✅ What changes between those three is heights, inset and the
   two content nodes. The structure does not.
5. **What would falsify it?** If other apps solving the same problem consistently *replace* the
   screen (push a route) instead of growing in place, then this is Airbnb's signature and the real
   pattern is a shared-element transition, not an expansion.

**1, 3 and 4 pass → `corroborated`.** Question 2 is a documented divergence and question 5 names the
observation that would demote it.

⭐ **Related work already in this repo**: the Supermarket search in `apps/mobile` solves the same
problem — a search field that grows while the screen reorganises around it (see the `cuadra-motion`
skill's reversible-timeline pattern). That is independent corroboration from a second
implementation, and its curves are worth comparing against the ones measured here.

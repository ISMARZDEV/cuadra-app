---
name: motion-in-place-tab-crossfade
description: >
  Reusable motion pattern: top-level tabs that swap the page body by fading it IN PLACE — zero
  horizontal travel — so a single header and bottom bar can persist across every tab and morph
  their own contents instead of being rebuilt per tab. Opacity only, ~280ms, no spring: a body
  arriving is a value, and values do not overshoot.
  Trigger: building top-level tab navigation, a super-app with several modes sharing one search
  header, segmented content areas, or any tab switch that currently slides sideways and forces
  each tab to carry its own duplicated chrome.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: uber (user-supplied clip, no MCP)
  evidence: corroborated
---

> Distilled with the `60fps-to-reanimated` method **without the MCP**, from a user-supplied clip.
> Raw record in [`../shot.json`](../shot.json). **Working code in [`src/`](src/)** — typechecked.

## Reference

| | |
|---|---|
| **Source** | user-supplied clip, `Uber.mp4` (1620×2160, 9.1s, 60fps) |
| **Frames** | [`frames/`](frames/) — 59 frames across **6** motion windows, 1080px |
| **Evidence** | `corroborated` — the same swap appears twice in the clip |

### Measured

Body opacity across the Eats → Uber swap, one sample per 50 ms frame:

```
7100  7150  7200 │ 7250  7300  7350  7400  7450  7500
 1.0   1.0   1.0 │ 0.35  0.6   0.75  0.85  0.95  1.0
      old body   │              new body fading up
```

**Swap is instant at ~7220 ms; the fade settles ~280 ms later. Horizontal travel: 0 px.**

⭐ The outgoing body is **cut**, not crossfaded — the incoming appears already at 0.35 on its first
frame. Against a dark background a fade-from-black and a true crossfade are indistinguishable, so
this is recorded as observed rather than inferred (`confidence: 0.85`).

## Description

Tabs change what the surface contains, not which surface you are looking at.

## Use cases

- Top-level tab navigation in a super-app (rides / food / delivery).
- A shared search header serving several content modes.
- Segmented dashboards where the filters stay and the data changes.
- Any tab switch that currently slides and therefore duplicates its chrome.

## Trigger

`tap` on a tab.

## Initial state

| Shared value | At rest |
|---|---|
| `opacity` (body) | `1` |
| `t` (header morph) | `1` |

## Animated properties

- **Body**: `opacity` only.
- **Header**: `opacity` of its morphing contents, on a shorter window.
- **Never**: `translateX`. Its absence is the pattern.

## Motion model

On a tab change the body subtree is replaced (a fresh `key`) and fades from ~0.35 to 1 over 280 ms
at its final position. The header and bottom bar are rendered **once**, outside the animated body,
and morph their own contents on a faster 180 ms window so the chrome has settled before the content
finishes arriving.

⭐ **Why in place, and not the reflexive horizontal slide.** A slide has to move the header too, or
the header must be duplicated inside each tab so each copy can travel with its own body. Both
outcomes are worse: the first makes a persistent search bar impossible, the second means the "same"
search bar is really N components that must be kept in sync. Fading in place buys a single header
that can morph — and that is what makes the app read as one surface with changing content instead
of several apps stacked behind tabs.

⭐ **The chrome settles first.** 180 ms header against 280 ms body is not decoration: the frame the
eye lands on first should already be telling it where it is.

## Spring/easing configuration

**No spring anywhere.**

| Element | Config |
|---|---|
| Body | `withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })` |
| Header contents | `withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) })` |

A body fading in is a VALUE the eye reads as "how ready is this" — and values do not overshoot.
Same rule that keeps counters on `withTiming` in `reward-recap-stagger`. Here `duration` is literal;
the 1.5× perceptual rule is spring-only.

## Gesture behavior

Tap only in the reference. ⭐ **Do not add swipe-between-tabs to this pattern.** A horizontal swipe
implies horizontal content travel, which is exactly what this pattern removes in order to keep the
header still. If the product needs swipe, it needs the sliding pager pattern instead — they are
different answers, not two settings of one thing.

## Entry / Exit behavior

Symmetric and identical in both directions: the same swap was measured twice in the clip
(Uber → Eats at 5217 ms, Eats → Uber at 7100 ms) with the same timing. Direction carries no meaning
here, so nothing should distinguish them.

## Implementation

| File | What |
|---|---|
| [`src/motion/timing.ts`](src/motion/timing.ts) | the two measured durations and the curve |
| [`src/motion/use-tab-swap.ts`](src/motion/use-tab-swap.ts) | body fade + header morph |
| [`src/components/tab-surface.tsx`](src/components/tab-surface.tsx) | chrome outside, body inside |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh uber in-place-tab-crossfade
```

⭐ **Composes with [`traveling-selection-indicator`](../../brilliant/traveling-selection-indicator/PATTERN.md)**
for the tab pill itself. That pattern moves one highlight between options; this one changes what is
below it. Together they are the whole tab bar, and neither needs to know about the other — the pill
reads the selected index, the surface reads the selected key.

## Configuration

| Prop | Type | Default | What it changes |
|---|---|---|---|
| `activeKey` | `string` | — | changing it triggers the swap |
| `SWAP_MS` | `number` | `280` | body fade duration |
| `HEADER_MORPH_MS` | `number` | `180` | header crossfade; keep it shorter than the body |
| `header` / `footer` | `ReactNode` | — | rendered ONCE, outside the animated body |

## Do

- Render the header and footer **once**, outside the animated body.
- Give the body a `key` so the outgoing subtree is cut, not parked at low opacity.
- Keep the header's morph shorter than the body's fade.
- `withTiming`, not `withSpring`.
- Let the tab pill be its own pattern.

## Don't

- ❌ Add `translateX`. Its absence is the entire point.
- ❌ Duplicate the header inside each tab.
- ❌ Add swipe-between-tabs — that is a different pattern (see Gesture behavior).
- ❌ Keep the outgoing body mounted underneath at low opacity: two dark layers at 0.5 are not the
  same as one at 1, and on a dark theme it reads as haze.
- ❌ Spring the fade.

## Accessibility / Reduce Motion

`useReducedMotion()` → both fades snap to 1. Nothing is lost: there is no positional information in
this transition, only opacity. Keep `accessibilityRole="tab"` and `accessibilityState={{ selected }}`
on the tabs, and announce the tab change — a fade is not an announcement.

## Corroboration

1. **Mechanism without the app?** ✅ *A tab switch that fades the body in place so the chrome can
   persist and morph.* Nothing about rides or food.
2. **Physics inside the library's priors?** ✅ Values use `withTiming`, not springs — the same rule
   as the counters in `reward-recap-stagger`. No divergence to justify.
3. **Three different screens?** ✅ Super-app modes, a shared-header dashboard, a segmented feed.
4. **Parameterisation real?** ✅ What changes is `activeKey` and the children. The structure does not.
5. **What would falsify it?** If comparable super-apps consistently slide their tab content
   horizontally, then in-place fading is Uber's choice and the general pattern is a pager.

⭐ **Observed twice within the single clip**, both directions, same timing. **1, 3 and 4 pass →
`corroborated`.**

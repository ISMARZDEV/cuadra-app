---
name: motion-self-sizing-sheet
description: >
  Reusable motion pattern: a bottom sheet whose HEIGHT is a function of its content. It grows on
  open and grows again whenever the content changes — a toggle adding a row resizes the sheet by
  exactly that row's height, using the same curve. The rows are never animated: they sit at their
  final positions and the container's rising edge reveals them, so N rows cost zero animations.
  Critically damped (ζ≈1.0) because a container being read as layout must not overshoot.
  Trigger: building an attachment/options/settings sheet whose rows appear conditionally, any
  panel that must resize when its contents change, or any container where adding a row currently
  causes a jump, a clip or an unwanted scroll.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: claude (user-supplied clip, no MCP)
  evidence: corroborated
---

> Distilled with the `60fps-to-reanimated` method **without the MCP**, from a user-supplied clip.
> Raw record in [`../shot.json`](../shot.json). **Working code in [`src/`](src/)** — typechecked.

## Reference

| | |
|---|---|
| **Source** | user-supplied clip, `Claude.mp4` (1620×2160, 8.1s, 60fps) |
| **Frames** | [`frames/`](frames/) — 62 frames across **5** motion windows, 1080px |
| **`source`** | `manual` — everything below is measured |
| **Evidence** | `corroborated` — see the checklist at the end |

### Measured

The sheet's header position across the opening, one sample per 50 ms frame:

```
204 → 148 → 116 → 108 → 107 → 106 → 106      (px, in the analysis crop)
 Δ    -56   -32    -8    -1    -1     0
```

**~220 ms, monotonic, zero overshoot** — it never passes its resting position and comes back.

⭐ **The motion WINDOW is not the animation.** `segment-motion.py` reported window 1 as 867 ms, but
the sheet itself moves for 220 ms of that; the rest is the button's press feedback and the backdrop
dim ramp. Never read a duration off a window — read it off the element.

## Description

A sheet that is always exactly as tall as its contents, whatever they currently are.

## Use cases

- Attachment / "add to" sheets whose options depend on context.
- Settings panels where a switch reveals dependent rows.
- Filter sheets that grow as criteria are added.
- Any container that today jumps, clips or scrolls when a row appears.

## Trigger

`tap` to open. **And every content change thereafter** — that is the pattern, not a side effect.

## Initial state

| Shared value | At rest | Note |
|---|---|---|
| `height` | `0` | animated container height |
| `contentHeight` (React state) | measured | ⭐ changes on layout, not per frame — state is its correct home |

## Animated properties

- **Primary**: the container's `height`.
- **Derived**: backdrop opacity, from `height / contentHeight`.
- **Not animated at all**: the rows. This is the point.

## Motion model

The content is measured off-screen; the visible container animates to that number and clips. The
rows are pinned to the **bottom** of the clipped container, so they do not move as it grows — only
the edge moves, and the edge passing over them is the reveal.

⭐ **N rows cost zero animations.** Compare `premium-bottom-sheet-spring`, where the sheet arrives
fully formed and each child animates itself in. Both are correct; they answer different questions.
Use a stagger when the arrival should feel composed and deliberate. Use an edge reveal when the
container's SIZE is the information — because then the growth already says everything, and
animating the rows on top of it says it twice.

⭐ **Because height is a function of content, opening is not a special case.** Open, close and
"a toggle added a row" are the same event with the same curve. A sheet that opens with one
personality and regrows with another reads as two components.

## Spring/easing configuration

| Use | Reanimated | ζ |
|---|---|---|
| Every height change | `{ mass: 1, stiffness: 361, damping: 38 }` | **1.0** |

Derived from a ~220 ms monotonic settle: ζ = 1.0 (critically damped, no overshoot), ω₀ ≈ 19 rad/s,
so `stiffness = ω₀² = 361` and `damping = 2ζω₀ = 38`.

⭐ **This sits deliberately outside the library's ζ≈0.72 signature.** That signature belongs to
things that ARRIVE. A container whose height is being consumed as layout must not overshoot: every
row inside would visibly fly past its final position and come back. Same reasoning as
`pill-to-panel-expansion` (ζ 0.86-1.0), and the general rule is now in the catalog.

## Gesture behavior

None in the reference — tap only. A drag-to-dismiss can be layered on exactly as
`premium-bottom-sheet-spring` does, feeding `height` from the pan and handing off with `velocity`.
⭐ But note the conflict: a drag sets the height *imperatively* while this pattern derives it from
content. Whichever wins must be explicit — the usual answer is that the gesture owns the height
while the finger is down, and content-sizing resumes on release.

## Entry / Exit behavior

**Symmetric by construction.** There is no separate exit animation: closing is `height → 0` through
the same spring. Symmetry here is not a choice, it is what "height follows content" means when the
content is nothing.

## Implementation

| File | What |
|---|---|
| [`src/motion/springs.ts`](src/motion/springs.ts) | the one measured config, used for every change |
| [`src/motion/use-self-sizing.ts`](src/motion/use-self-sizing.ts) | measure content, drive height, derive the rest |
| [`src/components/self-sizing-sheet.tsx`](src/components/self-sizing-sheet.tsx) | measuring copy + clipped container |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh claude self-sizing-sheet
```

⭐ **The children are rendered twice** — once off-screen to be measured, once inside the clipped
container. That is the price of animating to a measured height, and it is why the children must be
cheap and free of side effects. If they are not, the alternative is to compute the height
arithmetically from a row count instead of measuring.

## Configuration

| Prop | Type | Default | What it changes |
|---|---|---|---|
| `open` | `boolean` | — | target is `contentHeight` or `0` |
| `RESIZE` | `WithSpringConfig` | ζ 1.0 | the single curve for every height change |
| `BACKDROP_DIM` | `number` | `0.55` | maximum backdrop opacity |
| `backdropColor` | `string` | `#000` | dim colour |

## Do

- Measure the CONTENT and animate the CONTAINER — never both on the same node.
- Pin the rows to the bottom of the clipped container so only the edge moves.
- Use ONE curve for open, close and every regrowth.
- Keep ζ at 1.0: a container read as layout must not overshoot.
- Keep the measured children cheap; they render twice.

## Don't

- ❌ Animate a container's height while also deriving that height from its own children — it feeds
  its measurement back into itself and oscillates.
- ❌ Stagger the rows on top of the reveal: the growth already said it.
- ❌ Give the open a different curve from the regrow.
- ❌ Read the animation's duration off a `segment-motion` window (220 ms of motion sat inside an
  867 ms window).
- ❌ Put side effects in the measured children.

## ⚠️ Known collision: liquid glass

⭐ This repo's `cuadra-glass-button` skill already records that **a `GlassSurface` must never
auto-size to growing content** — it mis-measures on Fabric and the whole zone silently detaches and
drifts. This pattern is exactly that shape, so a glass version of this sheet will hit that bug.

Two ways out, both compatible with the pattern:
1. Measure and animate a plain `View`; place the glass **behind** it at a fixed size that already
   covers the maximum height.
2. Fix the glass at the tallest state and reveal with a mask instead of a height change.

## Accessibility / Reduce Motion

`useReducedMotion()` → the height snaps to its target. Nothing is lost: the layout at every stable
state is identical either way. Keep `accessibilityViewIsModal` on the open sheet, and remember that
a row appearing is a content change screen readers should be told about — the size animation is not
an announcement.

## Example usage

```tsx
const [open, setOpen] = useState(false);
const [webSearch, setWebSearch] = useState(false);

<SelfSizingSheet open={open} onClose={() => setOpen(false)}>
  <SourceRow />
  <ProjectRow />
  <Toggle label="Web search" value={webSearch} onChange={setWebSearch} />
  {/* Adding this row resizes the sheet — no extra animation code. */}
  {webSearch ? <ConnectorsRow /> : null}
</SelfSizingSheet>
```

## Corroboration — why one clip is enough here

1. **Does the mechanism survive stripping the app?** ✅ Remove the branding and the copy and what
   remains is *a container whose height follows its content, revealing with its own edge*.
2. **Does its physics land inside the library's priors?** ⚠️ One driver, N derivations: ✅. But
   ζ 1.0 sits above the ζ≈0.72 signature — **reasoned above**: layout must not overshoot. This is
   the second pattern to diverge the same way (`pill-to-panel-expansion` was the first), which
   makes it a sub-rule rather than an exception.
3. **Three different screens?** ✅ Attachment sheet, settings panel with dependent rows, filter
   sheet that grows.
4. **Is the parameterisation real?** ✅ What changes is the children. The structure does not.
5. **What would falsify it?** If other apps solving this consistently used a fixed-height scrollable
   sheet instead, then content-sizing is a stylistic choice rather than a pattern.

⭐ **Unusually strong for a single clip**: the same resize is observed **four separate times** in
the one recording — the open plus three content changes, all with the same curve. Internal
repetition is corroboration the other single-source patterns did not have. **1, 3 and 4 pass →
`corroborated`.**

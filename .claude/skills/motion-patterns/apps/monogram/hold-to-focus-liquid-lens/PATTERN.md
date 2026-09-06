---
name: motion-hold-to-focus-liquid-lens
description: >
  A hold-to-capture control stays sharp while a localized curved lens distorts and softens its
  background. The lens withdraws independently of processing dimming. Standalone Reanimated 4,
  Gesture Handler 3 and Skia translation; no audio engine or application integration.
license: Apache-2.0
metadata:
  author: aispace
  version: "0.1"
  method: 60fps-to-reanimated
  reference: monogram-tap-and-hold-mic-liquid-blur-pulse-interaction
  evidence: corroborated
  status: typechecked-and-shader-rendered; native-visual-unverified
---

## 60fps Reference

| Field | Record |
|---|---|
| Shot | https://60fps.design/shots/monogram-tap-and-hold-mic-liquid-blur-pulse-interaction |
| Clip | [hold-to-focus-liquid-lens.mp4](hold-to-focus-liquid-lens.mp4), gitignored, 2160x2160 at 60fps |
| Raw data | [../shot.json](../shot.json), [../SHOT.md](../SHOT.md) |
| Source | `manual`: actual video, no MCP analysis or generated SwiftUI |
| Timing | Entry about 250ms, withdrawal about 350ms, uncertainty about 75ms |
| Spring | Not identifiable. No stiffness, damping or mass inferred |
| Stagger | No measured item stagger; `stagger_delay: 0` |
| Evidence | Abstract mechanism corroborated by checklist; lens appearance single-source |

At 4067ms the card's lower edge is visibly bowed (about 15 +/- 5 recording pixels), and its text
is distorted. A uniform blur cannot produce this. At 6917ms the control already says Thinking;
at 7333ms distortion has not fully gone. Detector windows are NOT animation durations.

### Reference SwiftUI

None was available. No SwiftUI, recipes or native implementation were inferred. Our shader below
is a deliberate visual approximation, not reverse-engineered source. No identifiable overshoot
means no call to `measure-spring.py`: giving it invented peaks would create false precision.

## Description

A persistent capture control remains sharp while a curved focus lens rises through the surrounding
context, bending its edges and softening detail. The lens can retreat while processing remains dim.

## Use Cases

- Voice search over an existing results list.
- Dictation inside a document editor.
- A voice-note composer over a conversation.

The substrate, viewport, foreground content and capture callbacks change; the lens mechanism does
not. Do not use it as generic decoration or on frequent keyboard actions.

## Trigger

A sustained press activates capture. `useHoldAction` supplies start, finish and cancellation
callbacks. The 180ms hold threshold and 24pt movement allowance are translation choices, not
measurements. Permission and recorder startup belong to the host; `listening` must mean capture
really started. Accessible start/finish activation does not require holding.

## Initial State

`progress = Number(listening)` and `dim = Number(dimmed)` at mount. An initially active instance
does not flash an idle frame. In ordinary rest, both are zero. The backdrop remains mounted.
Dimensions must be positive and finite before mounting. A missing snapshot leaves live content
visible and permits dimming, rather than blanking the screen.

## Animated Properties

- Primary lens `progress`: all boundary position, curvature, displacement, blur and veil derive
  from it. Foreground controls never enter the image shader.
- Independent `dim`: the recording keeps dimming after the lens disappears, so coupling it to
  lens progress would incorrectly signal that processing had ended.
- Optional external `pulse` (0..1): bounded 20% modulation of displacement only, multiplied by
  progress. No internal perpetual clock, no audio amplitude assumption, zero by default.
- Native styles animate opacity only; dimensions are static layout, not per-frame width/height.

## Motion Model

The caller supplies an OPAQUE snapshot of ONLY the backdrop in the same viewport/aspect. Include
the background color when capturing: translucent captures would double-composite over the retained
native backdrop and ghost, even with an identity shader. A Skia image shader
samples it with a vertical displacement around a bowed boundary. That boundary travels from below
the viewport to the lower-middle region. Behind it a weighted 7x7 kernel softens detail, and a
theme-colored veil reduces contrast. The sharp foreground is a separate native layer.

This is not a live backdrop filter. Keep the underlying content stable while focused; otherwise
the frozen image and live view diverge. Refresh/invalidate the snapshot on layout, theme or content
changes, and retain it through withdrawal. Do not capture every frame, capture controls, or dispose
the image while Skia uses it. A stale image with matching aspect is still stale.

The geometry uses viewport ratios, NOT the mock phone's source pixels: final boundary 0.59H,
bow/displacement 0.04W, feather 0.075H, blur support input 0.018W. These are parameterized visual
approximations. The observed 15px bow does not uniquely determine the original displacement field.

## Spring/Easing Configuration

`LENS_TIMING`: 250ms in, 350ms out; both use `Easing.bezier(0.2, 0, 0, 1)`. Durations are guided by
estimated visible intervals; the easing is chosen, not fitted. With no defensible overshoot peak,
timing is preferable to inventing spring constants. Dimming uses a separate chosen 180ms ease-out.

The 350ms withdrawal exceeds the usual 300ms UI budget deliberately: the reference restores
legibility over roughly 350ms, and this is a return of context, not a delayed button response.
Recorder finish/cancel callbacks do not wait for animation completion.

## Gesture Behavior

`useLongPressGesture` (installed GH 3.0.2) calls `onActivate` once capture should start and
`onDeactivate(event.canceled)` once it finishes or is canceled. A failed pre-threshold touch never
started capture and therefore does not finish one. Native gesture recognition handles threshold
and cancellation; callbacks use JS only at these discrete commit points, never per frame.
There is no pan-driven displacement or velocity handoff: adding one would invent a drag mechanic.
Host must cancel real capture on navigation/unmount/app interruption independently of this hook.

## Entry Behavior

Set `listening=true` and ordinarily `dimmed=true`. The hook retargets current progress with timing;
it does not reset progress to zero on repeated activation. Keep control and transcript outside
the snapshot. The caller owns transcript arrival, not a fake fixed-delay typewriter.

## Exit Behavior

Set `listening=false` immediately on finish/cancel. Keep `dimmed=true` while a real operation is
pending; set it false on completion or abandonment. Do not serialize these on animation callbacks.
Both effects cancel obsolete animations on dependency changes and unmount. No hidden looping clock.

## Implementation

| File | Role |
|---|---|
| `src/motion/model.ts` | Pure worklet uniform builder, finite inputs, proportional geometry, timing constants |
| `src/motion/liquid-lens-shader.ts` | Actual SkSL displacement and softening shader |
| `src/motion/use-liquid-focus.ts` | Controlled lens/dim clocks and reduced-motion behavior |
| `src/motion/use-hold-action.ts` | GH3 start/finish/cancel adapter |
| `src/components/liquid-focus.tsx` | Retained native backdrop, image shader, dim, sharp foreground |
| `src/example.tsx` | Typed composition fixture with hold and non-hold controls; not a recorder |
| `tests/model.test.mjs` | Eight numerical invariants, no Reanimated mocks |
| `tests/shader.test.mjs` | Compiles and renders the SAME shader with CanvasKit; invalid-shader canary |

## Configuration

| Prop | Type | Contract/default |
|---|---|---|
| `listening` | boolean | Real capture state |
| `dimmed` | boolean | May persist through processing |
| `width`, `height` | number | Finite positive viewport, in RN layout units |
| `backdrop` | ReactNode | Retained content, same as snapshot |
| `snapshot` | SkImage or null | Caller-owned, opaque backdrop only, exactly aligned; null gives dim-only fallback |
| `foreground` | ReactNode | Accessible controls/transcript; host positions them |
| `pulse` | SharedValue<number> | Optional 0..1, no default animation |
| `veilColor` | readonly RGB tuple | 0..1, default light neutral; supply dark neutral in dark theme |

`src/example.tsx` typechecks the public API. Its provided snapshot must depict its own backdrop;
passing a reference screenshot will not match the example's native content. For a real host,
capture the mounted backdrop (not this whole component), then supply that image before activating.
Snapshot lifecycle is intentionally not hidden in a generic component.

## Do

- Keep sharp controls outside the sampled image and accessible while background is blocked.
- Keep lens and processing state independent; let real events drive both.
- Use one stable backdrop snapshot through each focus/withdrawal cycle.
- Treat the optional pulse as a host input, not a measured audio visualization.
- Profile the 49-sample shader on target hardware before production adoption.

## Don't

- Substitute uniform blur and claim the curved-text effect is reproduced.
- Treat a detector window, public title or source fps as a fitted spring or pulse period.
- Capture every frame, scale a native GlassView ancestor, or duplicate controls in the snapshot.
- Add a results UI, microphone permissions, speech SDK or app route to this standalone pattern.
- Assume typechecking proves gesture lifecycle, native worklets or frame-rate fidelity.

## Accessibility / Reduce Motion

System Reduce Motion disables the image lens entirely: no displacement, blur ramp or pulse.
Dimming and native capture state remain. The backdrop is removed from accessibility traversal
while listening/dimmed; the decorative snapshot is always hidden from it. Foreground is native,
not inaccessible canvas text. The example supplies an accessibility activate action and an ordinary
start/finish button for people unable to maintain a press. Host localizes labels and announcements.
Reanimated's `useReducedMotion` only supplies the startup preference. An `AccessibilityInfo`
subscription plus initial query updates live changes, with stale query/unmount protection. This
subscription still needs native execution checks in the eventual host.

## Corroboration Checklist

1. **Survives removing the brand?** Yes: sustained capture keeps its control sharp while background
   detail is temporarily displaced and softened.
2. **Fits library priors?** One progress drives coupled lens values; independent semantic dim
   agrees with observed processing. No defensible spring fit exists. Airbnb corroborates focus,
   not this lens. Arc/Brilliant/Uber share labels, not the mechanism.
3. **Three distinct screens?** Search results voice entry, document dictation, conversation voice
   composer. Each retains context under an active capture control.
4. **Real parameterization?** Viewport, sampled background, foreground nodes, veil color and
   callbacks vary without restructuring the mechanism.
5. **Falsifier?** If independent capture interfaces require uninterrupted background legibility,
   or the observed lens relies on a source-specific spatial mesh that this approximation cannot
   preserve, demote the reusable lens claim to single-source. Matching generic fades is insufficient.

Questions 1/3/4 pass: `corroborated` at the interaction level. No claim that the lens is a universal
convention; its exact silhouette and physics remain single-source and unverified respectively.

## Verification

```bash
node --experimental-strip-types --test .claude/skills/motion-patterns/apps/monogram/hold-to-focus-liquid-lens/tests/*.test.mjs
~/.claude/skills/60fps-to-reanimated/assets/check-schema.py
~/.claude/skills/60fps-to-reanimated/assets/verify.sh monogram hold-to-focus-liquid-lens
```

This session passed `verify.sh` using an external temporary Expo adapter with the actual project
node_modules and tsconfig, so its sandbox never touched `apps/mobile`. Both the invalid spring and
invalid shader canaries failed as expected. Model tests first failed before implementation.

CanvasKit generated twelve offscreen states (six each light/dark); light/dark active, entering and
reduced samples were inspected. Curvature is present, the upper region remains unchanged, reduced
equals rest pixel-for-pixel. The initial nine-tap blur showed doubled outlines; a 7x7 weighted
kernel softened them. Fine repetitive lines still reveal sampling, and the reference has a richer
moving distortion field and softer material. This is NOT pixel-identical native fidelity.

**Native visual verification remains open.** These are actual shader renders on synthetic cards,
not the React Native component, native gestures or an FPS measurement. A simulator and Cuadra are
installed, but no standalone host exists there; no integration was introduced. React Doctor's
workspace scan reports pre-existing broad branch findings and selected library files are skipped
by its workspace config; it does not establish a clean diagnostic score for this entry.

Exact remaining work before production use: mount in a dedicated standalone native host; align a
real captured backdrop; record hold/release/cancel, rapid reversals, initial-active mounting,
rotation/theme changes, Reduce Motion and accessibility activation; check light/dark and actual
frame budget on a production bundle. Revisit the blur kernel or preblurred snapshot if profiling
requires it. No recorder or application wiring is part of this library delivery.

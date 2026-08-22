# deliberate-return-sheet

## 60fps reference

| | |
|---|---|
| **Shot** | user clip — no MCP. `Details Supermarket Save.mp4`, 1068×2160, 18.1 s, 60 fps |
| **Clip** | [`Details Supermarket Save.mp4`](Details%20Supermarket%20Save.mp4) — in this folder, gitignored. **Watch it** |
| **Raw data** | [`../shot.json`](../shot.json) · [`../SHOT.md`](../SHOT.md) |
| **`source`** | `manual` — measured, not labelled. There is no Swift file and none is missing |
| **`animation`** | `.easeOut(0.15)` in · `.easeIn(0.42)` out — **not a spring** |
| **`stagger_delay`** | `0` — `motion_params.stagger` is `none`, so zero is the honest value |
| **Triangulation** | one clip → `evidence: single-source`. See the checklist below |

## Description

A sheet that arrives fast over a page which dims and recedes, and then takes nearly three times as
long to hand that page back. Neither direction overshoots.

## Use cases

1. Choosing one option from a list that belongs to the page underneath (a store, a card, an address).
2. A filter panel over a results grid the user must return to and re-read.
3. Any "pick one and come back" step where losing your place in the host page is the real failure.

## Trigger

`tap` on an affordance inside the host page. Not a drag — see Gesture behavior.

## Initial state

`progress = 0`. Sheet fully below the viewport, veil at opacity 0, host at scale 1.

⭐⭐ **The mount frame was a REAL bug, not a risk — found while porting this pattern into the app.**
This section used to say "the sheet must already be measured"; it never is. `onLayout` runs AFTER
the first paint, so on frame 0 `sheetHeight` is `0` — and with zero travel a CLOSED sheet is drawn
at `translateY: 0`, i.e. **fully open, over the whole screen**, until layout lands. It flashes on
entering the screen, before anyone opened anything.

Fixed in [`src/motion/sheet-travel.ts`](src/motion/sheet-travel.ts): until there is a real
measurement the sheet hides by the whole **viewport**, which is always ≥ its own height. A negative
or `NaN` measurement (they arrive from intermediate layouts) takes the same path — no bad number may
translate into "visible". Same idea as `cuadra-motion` §2: the RESTING state must not depend on a
value that has not arrived yet.

⚠️ A warning in a document does not protect the code. This one was written down and the `src/` still
shipped the defect.

⭐⭐ **And the FIX shipped a second bug — a runtime crash, caught only on device.** `closedOffset`
was called from inside `useAnimatedStyle`, i.e. from a worklet, and a worklet cannot synchronously
call a plain JS function: `[Worklets] Tried to synchronously call a non-worklet function`. The rule
is in the method skill (§4b: *never capture a JS FUNCTION in a worklet*) and it was broken anyway,
two edits after quoting it.

The fix is also the better design: the offset depends on LAYOUT, not on the frame, so it is computed
once in JS and the worklet captures a **number**. Recomputing it 60 times a second was work thrown
away on top of being illegal.

**Neither of these two defects was visible to `tsc` or to any test.** The typecheck was green, the
canary went red on demand, 458 tests passed — and the screen crashed on the first tap. Motion has to
be run.

## Animated properties

| Property | Role |
|---|---|
| `progress` (0→1) | **PRIMARY** — the single driver |
| sheet `translateY` | DERIVED — `interpolate(progress, [0,1], [height, 0])` |
| veil `opacity` | DERIVED — `interpolate(progress, [0,1], [0, 0.45])` |
| host `scale` | DERIVED — `interpolate(progress, [0,1], [1, 0.94])` |

Transform and opacity only.

## Motion model

One clock, three readings. The sheet leads; the veil and the host's recede are `interpolate` of the
same `progress`. Three parallel shared values would drift apart the moment one duration is touched,
and here the durations ARE the pattern.

## Spring/easing configuration

**No spring.** Both vertical kymographs (`frames/kymoV_w2.png`, `frames/kymoV_w3.png`) climb and go
flat — no reversal, so no overshoot, so nothing for `measure-spring.py` to solve. The translation is
`withTiming` + bezier, per §3.1b.

```
OPEN_MS  = 150   Easing.out(Easing.cubic)
CLOSE_MS = 420   Easing.in(Easing.cubic)
ratio    = 2.8x
```

⭐ Measured, not read off the window bounds. `peek.sh` reported 383 ms / 767 ms — those include
padding and are wrong as durations. The kymograph is the instrument; the window is only where to
point it.

## Gesture behavior

N/A, and that is the clip's own answer: the sheet is raised by a tap and dismissed by a tap. This is
the right call for a *selection* sheet — the rows are targets, so a drag competing with the list's
own scroll buys ambiguity and no capability.

⭐ If a drag IS added later, the release must hand off with `velocity`, and the tap-driven
`CLOSE_MS` no longer governs a flung dismissal — a fling that still takes 420 ms feels stuck. Add
the drag and the deliberate return is no longer one number.

## Entry behavior

150 ms, decelerating. The decision was made before the tap, so the sheet must be there before the
thought finishes; ease-out is what makes it read as *arrived* rather than *snapped*.

## Exit behavior

420 ms, accelerating. **Deliberately asymmetric.** The user is being handed back a page they must
re-find their place in, and accelerating away uncovers the page early in the gesture — which is the
part the eye actually uses. Derived from what the exit means, not copied from another pattern.

## Implementation

### Reference SwiftUI — NOT implemented

None exists: this came from a video, not from the MCP. Nothing was translated, and nothing is
missing — the numbers here were measured, which is the stronger source.

⭐ The reference clip is a concept mock carrying real store brands, logos and product photography.
**The mechanism is what we take.** Copy, brands and art are never ported.

### Ours — the files that ship

| File | What |
|---|---|
| [`src/motion/timings.ts`](src/motion/timings.ts) | the two durations, the two curves, and why they differ |
| [`src/motion/sheet-travel.ts`](src/motion/sheet-travel.ts) | the closed offset — guards the mount frame |
| [`src/motion/use-deliberate-sheet.ts`](src/motion/use-deliberate-sheet.ts) | one driver → three derived styles |
| [`src/components/deliberate-return-sheet.tsx`](src/components/deliberate-return-sheet.tsx) | host + veil + sheet |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh grocery-concept deliberate-return-sheet
```

## Configuration

| Prop | Type | Default | Changes |
|---|---|---|---|
| `open` | `boolean` | — | the driver's target |
| `onRequestClose` | `() => void` | — | veil tap |
| `onClosed` | `() => void` | — | fires once fully gone — commit point |
| `host` | `ReactNode` | — | the page that dims and recedes; stays mounted |
| `VEIL_OPACITY` | `number` | `0.45` | how dark the host goes |
| `HOST_SCALE` | `number` | `0.94` | how far it recedes |

## Do

- Keep the host **mounted**. Getting the page back exactly where it was left is the whole argument
  for the slow return.
- Keep `onClosed` on the completion callback, so navigation and refetches happen after the motion.
- Change both durations together if you change one — the ratio is the pattern, not the numbers.

## Don't

- Don't symmetrise it. 420 ms in both directions makes the sheet feel slow; 150 ms in both makes the
  page feel snatched away.
- Don't animate the veil or the host on their own clock.
- Don't add a spring. There is no overshoot in the reference and a bouncing list reads as broken.
- Don't port the reference's brands, copy or photography.

## Accessibility / Reduce Motion

`useReducedMotion()` jumps `progress` to its target and fires `onClosed` synchronously. The sheet is
CONTENT, so it must still appear — what is dropped is the travel, never the availability. The veil
still renders at full opacity so the host is still visibly inert.

## Example usage

```tsx
const [picking, setPicking] = useState(false);

<DeliberateReturnSheet
  open={picking}
  onRequestClose={() => setPicking(false)}
  onClosed={() => refetchPrices()}
  host={<ProductDetail onPickStore={() => setPicking(true)} />}
>
  <StoreList onSelect={(id) => { choose(id); setPicking(false); }} />
</DeliberateReturnSheet>
```

## Corroboration checklist (§5) — one clip

1. **Survives stripping the app?** Yes. Remove the meat photo, the store logos and the currency and
   there is still a mechanism: a surface that arrives fast and returns slowly over a page that waits.
2. **Physics inside the library's priors?** It **disagrees**, with a reason. Every other sheet here
   springs; this one does not, because it is a surface carrying a list to read rather than an object
   arriving. It agrees with the deeper prior — one driver, N derivations — and with the exit-speed
   principle, of which it is now the fourth and most extreme reading (2.8x).
3. **Three different screens?** Store picker · filter panel over a grid · address chooser at checkout.
4. **Parameterisation real?** Yes: durations, veil opacity, host scale, and the content. The
   structure does not change between the three uses above.
5. **What would falsify it?** Finding that the 420 ms is this mock's transition preset applied
   globally rather than a choice about returning context — i.e. seeing the same 420 ms on a motion
   that is NOT a return. Window 5 (the screen pop, ~434 ms) is *consistent* with the principle, but
   it is also consistent with "one slow preset for everything". That is the honest doubt, and it is
   why this stays `single-source`.

Passes 1, 3 and 4 — the floor for `corroborated` — but 5 names a live alternative explanation, so
the grade stays **`single-source`** until a second clip separates the two.

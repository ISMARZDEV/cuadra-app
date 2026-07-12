---
name: cuadra-insights-wheel
description: >
  Cuadra's Insights home "wheel" — the circular budget-consumption gauge with its 7 surrounding
  nav buttons, category-band pills (overlapping, tap-to-reveal wave), and the dev-only mock-data
  preview toggle used to design-iterate it without a backend. Encodes the hard gotchas — TWO
  separate rings traced from the reference SVG (a thin accent ring is NOT the same ring as the
  thick colored-band track, different radius AND stroke-width), the colored arc fills by
  spent/budget ratio not a fixed 100%, category badges must be pinned to their OWN band (never a
  separate markers array that can drift out of sync), the overlap/z-order direction that makes
  bands look "shingled" correctly vs backwards, and why the dev-mock floating toggle must NEVER be
  a `<Modal>`. Trigger: Building or editing apps/mobile/src/features/insights/components/
  insights-wheel.tsx, its category bands/badges, its dev-mock-toggle.tsx, or dev-mock.ts.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Composes with `cuadra-design-system` (palette/look) and `cuadra-mobile` (structure, §6 native
> gotchas).** This skill is only the wheel's own recipe + gotchas, distilled from the design-
> iteration session that built it (feat/chat-ui-polish). Reference SVGs:
> `apps/mobile/src/public/svg/wheel-reference-desing-{dark,light}.svg`.

## When to Use

- Editing `insights-wheel.tsx` — the ring(s), the 7 nav buttons, category bands/badges, the trend
  squiggle, or the empty/populated layouts.
- Adding/adjusting `WheelBand` entries (real data or `dev-mock.ts`'s mock categories).
- Building/editing the dev-only mock-preview toggle (`dev-mock-toggle.tsx`, `dev-mock.ts`,
  `use-dev-mock-store.ts`) or debugging why it freezes the screen / doesn't show / hides itself.
- Debugging: bands look too thin/small, category badges centered instead of at the tip, colors
  overlapping "backwards", round caps bulging into each other, or the wheel just won't respond to
  taps.

## Critical Patterns (the gotchas — read these FIRST)

1. **The wheel has TWO SEPARATE rings — don't reuse one radius/stroke for both.** `RING_RADIUS`
   (126.54 scaled) is the THIN lime accent ring — traced exactly from the reference SVG's own
   `<rect>` (stroke-width `3`). The THICK colored-band track (`TRACK_RADIUS`/`TRACK_STROKE`) is a
   completely different, larger ring in the reference (its own masked stroke path, centerline
   ≈150 ref units, stroke-width `38.9171` in the original — tuned down in this app's final pass).
   **Symptom if conflated:** the band track renders too small/thin ("se ve un poco pequeña"
   comparing device vs Figma). **Fix:** always grep the reference SVG for the actual per-shape
   `stroke-width` before reusing a constant across two visually distinct rings.

2. **The colored arc is a GAUGE, not a pie chart — it fills by `spent/budget`, capped at 100%.**
   `spentRatio = budgetMinor > 0 ? clamp(totalExpenseMinor / budgetMinor, 0, 1) : 0`; the total
   sweep handed to the bands is `(ARC_END_DEG - ARC_START_DEG) * spentRatio`, NOT the full arc.
   The ring only closes completely once spending reaches/exceeds the budget. The muted background
   track is a SEPARATE `<Path>` that always spans the full `ARC_START_DEG`→`ARC_END_DEG` sweep,
   underneath — that's what shows through as "remaining budget."

3. **A category's emoji badge lives ON its own `WheelBand`, never in a separate `markers[]`
   array.** `WheelBand` has optional `emoji`/`ringColor`/`onPress` fields — omit them for a plain
   color band with no badge (e.g. `DEFAULT_BANDS`, the generic no-category-data fallback). This
   was a real bug fixed in this session: a parallel `CategoryMarker[]` with its own hand-picked
   `angleDeg` values drifted out of sync with the actual band geometry (badges centered inside
   their band instead of pinned to its tip). Deriving the badge position FROM the band's own
   computed arc removes the possibility of drift entirely.

4. **Badges pin to `band.visualEnd` (the tip AFTER the overlap extension), not `band.end` (the
   pre-overlap math boundary).** See gotcha 5 for what `visualEnd` actually is — get this wrong and
   badges sit visibly short of where their color actually ends ("no están llegando a las puntas").

5. **Band overlap + z-order — the band CLOSER TO THE ARC'S START (the '+' side button) must
   always be on TOP at a junction, never the far one.** This needs BOTH halves right:
   - `visualEnd = isLast ? end : end + BAND_OVERLAP_DEG` — each band's OWN end extends FORWARD
     into the next band (not the next band's start pulled backward — that overlaps the wrong way).
   - Paint order is `[...bandArcs].reverse()` — the LAST band is drawn first (bottom), the FIRST
     band drawn last (top), so the earlier band's forward extension actually paints over the next
     one. Do only one of these two and it looks "backwards" (confirmed twice in this session —
     first the shrink-based gap version overlapped the wrong direction, then the extend-based
     version without reversed paint order also read backwards until BOTH were flipped together).
   - Round caps (`strokeLinecap="round"`) only look right on EITHER a clean gap between segments
     OR this overlap+reversed-z-order combo. Round caps on flush, non-overlapping, same-z-order
     segments bulge into each other at every joint ("una encima de la otra").

6. **Category badges are BUTTONS (press-scale + haptic — same recipe as `NavButton`/`EditButton`
   elsewhere in this file), hidden by default.** Tapping the ring's bar (an `onPress` on the
   `<Path>` elements — react-native-svg shapes support it natively) reveals them with a
   left→right WAVE staggered by array index (`withDelay(index * 90, withSpring(...))`), auto-hides
   after ~7s, and a SECOND tap while showing hides them immediately (toggle, not just a timer
   reset). Per `cuadra-mobile` skill §6: reanimated `entering`/layout-animation props don't fire
   reliably on the New Architecture here — the wave is driven manually, a shared value flipped
   inside a plain `useEffect` watching the `visible` prop, not a mount-transition preset.

7. **The dev-mock floating toggle must NEVER be a `<Modal>`.** A transparent `Modal` captures ALL
   touches for the FULL SCREEN at the native level (a separate UIWindow/Dialog) even with
   `pointerEvents="box-none"` on its content — this literally froze the whole Insights screen
   (nothing tappable, no navigation) the first time it was tried. The custom tab bar
   (`CuadraTabBar`) is ALSO a real gotcha here: it's mounted as the LAST sibling inside
   expo-router's `BottomTabView` (after the entire screens container), so no `zIndex` set INSIDE a
   screen can ever out-rank it — that's cross-subtree paint order, not a z-index fight. **Fix:**
   render the toggle as a plain absolutely-positioned `View` (PanResponder-draggable, magnetic
   edge-snap on release — this repo has no `react-native-gesture-handler`, see
   `insights-carousel.tsx`'s own note), mounted as a LATER SIBLING of the WHOLE `<Tabs>` navigator
   in `app/(tabs)/_layout.tsx` — being later than the entire navigator (screens AND tab bar) wins
   by normal RN sibling paint order, no Modal, no zIndex tricks needed.

8. **Mock data must be typed against the REAL generated SDK types and seeded via the SAME query
   keys the real hooks use.** `dev-mock.ts` imports `CurrencyMetrics`/`DailyTarget`/
   `AccountResponse`/`TransactionResponse`/`CurrencyPreferencesResponse` straight from
   `@cuadra/api-client` and seeds via `queryClient.setQueryData(KEY, mockPayload)` using the EXACT
   key builders exported from `api.ts` (`METRICS_KEY`, `DAILY_TARGET_KEY`, etc.) — never
   hand-rolled duplicate key arrays. **Clearing must use `removeQueries`, not
   `invalidateQueries`:** invalidate only triggers a background refetch and leaves the STALE mock
   numbers on screen until that refetch resolves — without a reachable dev backend/session it may
   never resolve, leaving a confusing half-mock screen (mock dollar figures with no mock category
   bands, since the wheel's bands react instantly to the store flag but the query cache doesn't).
   `removeQueries` forces every hook back to `data: undefined` immediately.

9. **Test harness gotchas picked up fixing this component's tests:**
   - The shared `react-native-svg` stub (`src/test/svg-stub.tsx`) needs `Filter` and
     `FeDropShadow` exported — added when the wheel started using an SVG drop-shadow filter for
     the background blob. Extend the SHARED stub, don't special-case per test file.
   - Any component with haptic feedback needs `vi.mock("expo-haptics", () => ({ impactAsync:
     vi.fn(), ImpactFeedbackStyle: { Light: "light" } }))` in its test — forgetting it surfaces as
     a cryptic `ReferenceError: __DEV__ is not defined` deep in `expo-modules-core` (jsdom has no
     RN/Metro globals), not an obviously-haptics-related error.
   - `insights-wheel.test.tsx` also needs `vi.mock("../use-dev-mock-store", () => ({
     useDevMockStore: () => false }))` — the real store transitively imports the generated SDK via
     `dev-mock.ts`, which hits the same `__DEV__` issue.

## Commands

```bash
pnpm --filter @cuadra/mobile typecheck      # tsc --noEmit after edits
pnpm --filter @cuadra/mobile test           # vitest — insights-wheel.test.tsx + siblings
pnpm mobile:sim                             # iOS simulator (Expo Go) to eyeball the ring live
```

## Resources

- **Working component**: `apps/mobile/src/features/insights/components/insights-wheel.tsx`
- **Category band type**: `apps/mobile/src/features/insights/interfaces.ts` (`WheelBand`)
- **Mock preview**: `dev-mock.ts`, `use-dev-mock-store.ts`, `components/dev-mock-toggle.tsx`
- **Reference SVGs**: `apps/mobile/src/public/svg/wheel-reference-desing-{dark,light}.svg`
- **Tab bar it must paint above**: `apps/mobile/src/components/navigation/cuadra-tab-bar.tsx`,
  mounted via `apps/mobile/app/(tabs)/_layout.tsx`

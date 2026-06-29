---
name: cuadra-glass-button
description: >
  Cuadra's round liquid-glass symbol button (the chat +/mic/menu buttons): tinted iOS-26
  GlassView with a colorless depth gradient, theme-inverted brand colors, and a springy press.
  Encodes the hard gotchas — react-native-svg (NOT expo-linear-gradient) for the gradient,
  no overflow:hidden under a scale transform, never SCALE an ancestor of a native GlassView
  (it distorts/saturates the liquid glass), a visible border needs a REAL RN style border (the
  native GlassView ignores the borderWidth/borderColors/intensity props), and glass only reads
  when it OVERLAYS content (else it looks flat).
  Trigger: Building or editing round glass/symbol buttons in apps/mobile (chat tool bar, headers),
  or any GlassSurface-based control that needs a tint, a depth gradient, a press animation, a
  visible border/stroke, or the see-through "bleed" look.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Composes with `cuadra-design-system` (palette/look) and `cuadra-mobile` (structure).** This skill
> is only the glass-button recipe + its non-obvious gotchas. For the liquid-glass surface itself see
> `@/components/ui/glass-surface` (GlassSurface).

## When to Use

- Building/editing a round **symbol button** (icon-only) on a glass surface — chat `+` / mic, header
  menu / maximize, or any `GlassButton`.
- Adding a **tint**, a **depth gradient**, or a **press animation** to a `GlassSurface` control.
- Debugging a glass control that shows **"Unable to get the view config … ExpoLinearGradient"**, a
  **clipping/"mask cut" artifact while pressing**, or a **saturated / distorted-texture flash** on a
  glass button while a parent animates (e.g. a drawer/sheet reveal).
- Debugging a glass surface whose **border/stroke won't show on device** (gotcha 7) or that **looks
  flat / "doesn't look like glass"** (gotcha 8).

## Critical Patterns (the gotchas — read these FIRST)

1. **Depth gradient → `react-native-svg`, NEVER `expo-linear-gradient`.** The native view
   `ExpoLinearGradient` is not reliably linked into the dev build → it renders *"Unimplemented
   component"* / *"Unable to get the view config for … ExpoLinearGradient"* on a physical device,
   even though it works in Expo Go (Expo Go bundles it). `react-native-svg` is already used across the
   app (navbar, card, orb, bubbles) so it is guaranteed present. Same recipe as the chat `CardGradient`.

2. **No `overflow: "hidden"` on a glass that gets a `transform: scale`.** The rounded clip does NOT
   follow the transform on iOS, so the square `<Rect>` corners "cut" through during the press. Instead
   draw the gradient **already circular** (`<Rect rx={size/2} ry={size/2}>`) so no clip is needed.

3. **Unique gradient id per instance** (`useId()`). Multiple `<Svg>` with the same `<Defs>` id can
   collide. `const gid = \`btnGrad-${useId()}\``.

4. **Press feedback is driven by us, not the native glass.** The native `isInteractive` glass
   "light-up" is hidden under the depth gradient, so drive a reanimated **spring scale** on an
   `AnimatedPressable` via `onPressIn`/`onPressOut` (consistent on iOS & Android).

5. **Tint via `GlassSurface`'s `tint` prop**, not a background View — it maps to the native GlassView
   `tintColor` on iOS 26 and to a translucent overlay on the blur/web fallback (Expo Go / Android).

6. **NEVER animate a `transform: scale` on an ANCESTOR of a native GlassView.** iOS 26 rasterises the
   liquid-glass effect and then GPU-stretches that bitmap, so any `scale` on a parent makes the glass
   **over-saturate its tint and show a grainy/distorted texture for the whole animation**, then snap
   back when it settles. **Translation (`translateX`/`translateY`) is safe; scale is not.** This bit us
   on the AISpace sessions drawer: the chat card's reveal used `transform: [{ translateX }, { scale: 1 - p*0.05 }]`
   and the `scale` distorted the header's glass buttons (`chat-screen.tsx` `shadowStyle`). Fix = drop
   the `scale`, keep only `translateX`. If you truly need a depth/push-back cue while a glass surface is
   on screen, fake it with translate or opacity — not scale. (NB: the button's OWN brief press-scale on
   its glass is tolerable because it's <400ms; a sustained/ancestor scale is what reads as broken.)

7. **A visible border/stroke needs a REAL RN border in `style` — the native GlassView IGNORES the
   `borderWidth` prop, `borderColors`, and `intensity`.** Those three only drive the **fallback**
   (BlurView + gradient-frame, Expo Go / Android / older iOS). On the iOS-26 dev-build `GlassSurface`
   renders a native `GlassView`, which honors `style.borderWidth` / `borderColor` / `borderRadius`
   (RN border) but NOT the prop-driven gradient frame nor `intensity`. **Symptom:** you bump
   `borderWidth={5.5}` / pass `borderColors` / change `intensity` and **nothing changes on the
   device**, yet a faint `style={{ borderWidth: 1 }}` DOES show. Fix = put the stroke in `style`
   (`borderWidth` + `borderColor`), which works on BOTH paths. This is how the chat **card + dock**
   contour was made visible (`chat-screen.tsx`, ~1.5px `rgba(255,255,255,0.45)` dark / `rgba(0,0,0,0.18)`
   light). The added `borderColors` prop on `GlassSurface` only helps the fallback — it's a no-op on
   device.

8. **Glass only "reads" when there's CONTENT with contrast BEHIND it.** A `GlassView` is a backdrop
   effect — over a flat dark surface it looks like nothing ("no se ve glass"). To get the bleed-through
   look (e.g. the chat showing softly behind the input dock), the glass surface must **OVERLAY**
   scrollable content (absolute, on top in z-order), not sit in-flow above a plain background. We made
   the AISpace bottom zone (dock + input) an absolute overlay over the `ScrollView`, with a dynamic
   `paddingBottom` reserving its measured height so the last message clears it. The dock body itself
   uses NO own `GlassSurface` (stacking two native GlassViews over-darkens) — one glass layer per zone.

## Colors — theme-inverted brand pair

| Token | Dark | Light |
|---|---|---|
| Glass tint (bg) | `#002E22` | `#C2FB7E` |
| Icon | `#C2FB7E` | `#002E22` |
| Depth gradient | `#000000` (shadow) | `#E7FDCD` (lime highlight) |

The pair is inverted per theme so the icon never washes out: dark = dark-green glass + lime icon;
light = lime glass + dark-green icon. The gradient is a *shadow* in dark, a *highlight* in light.

**`accent` (the primary/send button)** flips the theme (`styleDark = accent ? !isDark : isDark`),
making it the photo-negative of the tool buttons: dark → lime fill + dark icon; light → dark-green
fill + lime icon. UX reason: the tool buttons are already brand-green, so the send button can only
stand out (and the **mic⇄send swap read clearly**) by inverting — never by being "green too".

## UX: the mic ⇄ send swap

- Empty field → **mic** (voice note). Text present (`value.trim().length > 0`) → **send** (`accent`).
- Animate the swap with reanimated `entering={ZoomIn}/exiting={ZoomOut}` inside a FIXED-size box so
  layout never shifts. Send/clear must revert to the mic — and the two buttons MUST look distinct
  (hence `accent`), or the revert looks like "nothing changed / the button got stuck".

## Code Example (the load-bearing parts)

```tsx
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Circular depth gradient — react-native-svg, rounded so the glass needs no overflow:hidden.
function ButtonDepthGradient({ color, size }: { color: string; size: number }) {
  const gid = `btnGrad-${useId()}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} rx={size / 2} ry={size / 2} fill={`url(#${gid})`} />
    </Svg>
  );
}

// Press: springy scale-down on the whole button (NO overflow:hidden on the GlassSurface).
const pressScale = useSharedValue(1);
const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
const onPressIn = () => { pressScale.value = withSpring(0.86, { damping: 15, stiffness: 320, mass: 0.6 }); };
const onPressOut = () => { pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 }); };

<AnimatedPressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={[shape, animStyle]}>
  <GlassSurface isInteractive tint={tint} style={{ ...shape, alignItems: "center", justifyContent: "center" }}>
    <ButtonDepthGradient color={gradientColor} size={size} />
    <Icon as={icon} size={iconSize} color={glassIconColor} />
  </GlassSurface>
</AnimatedPressable>
```

`shape = { width: size, height: size, borderRadius: size / 2 }`. Every button (mic, +, header,
send) uses the SAME glass treatment — the send button just passes `accent` to invert the colors.

## Commands

```bash
pnpm --filter @cuadra/mobile typecheck   # tsc --noEmit after edits
pnpm mobile:sim                          # run in the iOS simulator (Expo Go) to eyeball it
```

> Verify on a PHYSICAL device / dev-build, not just Expo Go: the `expo-linear-gradient` and native
> liquid-glass differences only surface there (see gotcha #1).

## Resources

- **Working component**: `apps/mobile/src/features/aispace/components/glass-button.tsx`
- **Glass surface + tint prop**: `apps/mobile/src/components/ui/glass-surface.tsx`
- **Same gradient recipe (card)**: `CardGradient` in `apps/mobile/src/features/aispace/chat-screen.tsx`

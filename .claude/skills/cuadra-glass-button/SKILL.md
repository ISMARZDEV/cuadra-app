---
name: cuadra-glass-button
description: >
  Cuadra's round liquid-glass symbol button (the chat +/mic/menu buttons): tinted iOS-26
  GlassView with a colorless depth gradient, theme-inverted brand colors, and a springy press.
  Encodes the hard gotchas — react-native-svg (NOT expo-linear-gradient) for the gradient, and
  no overflow:hidden under a scale transform.
  Trigger: Building or editing round glass/symbol buttons in apps/mobile (chat tool bar, headers),
  or any GlassSurface-based control that needs a tint, a depth gradient, or a press animation.
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
- Debugging a glass control that shows **"Unable to get the view config … ExpoLinearGradient"** or a
  **clipping/"mask cut" artifact while pressing**.

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

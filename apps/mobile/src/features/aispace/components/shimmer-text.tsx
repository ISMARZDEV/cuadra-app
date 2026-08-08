import { useMemo } from "react";
import { View } from "react-native";
import {
  Canvas,
  LinearGradient,
  matchFont,
  Text as SkiaText,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { CHAT_BODY_WEIGHT } from "../chat-typography";
import type { ShimmerTextProps } from "../interfaces";

// A bright band sweeping across dimmed glyphs — the "working on it" cue ChatGPT for iOS and v0 use.
// Technique straight from Margelo's post (and its demo's ShimmerText): the text is drawn INTO a Skia
// Canvas and its glyphs are filled with a horizontal dim → bright → dim gradient whose start/end
// walk across the line. Nothing here animates a React style — the sweep lives entirely on the UI
// thread, driven by Skia's `useClock` (a shared value that ticks every frame).
//
// Why NOT a MaskedView + animated overlay: that composites a second view over the text every frame
// on the JS/Fabric side. Filling the glyphs' own paint is one draw call and never re-lays out.
//
// PERFORMANCE — the lesson from orb-sphere.tsx: a Skia clock keeps ticking for as long as its
// component is MOUNTED, and merely hiding the component does NOT stop it (that cost the orb four
// paths per frame on every screen until it got an explicit guard, commit 7f18747). This component
// needs no such guard, but only because its parent unmounts it: TypingIndicator returns null when
// it isn't rendered, so the clock exists exactly while the shimmer is on screen. If this ever gets
// mounted permanently and toggled by opacity/visibility, it MUST take the orb's guard treatment.
export function ShimmerText({
  text,
  fontSize = 18,
  baseColor,
  highlightColor,
  periodMs = 1500,
}: ShimmerTextProps) {
  // La fuente del SISTEMA, igual que el resto del chat (chat-typography). Se consigue omitiendo
  // `fontFamily` en `matchFont`: su default es literalmente "System", que el FontMgr de Skia
  // resuelve a la cara nativa (SF Pro / Roboto) — el mismo gesto que en RN, del otro lado.
  // `matchFont` NO es un hook y nunca devuelve null, pero crea un objeto de fuente: se memoiza.
  const font = useMemo(
    () => matchFont({ fontSize, fontWeight: CHAT_BODY_WEIGHT }),
    [fontSize],
  );
  const clock = useClock();

  // Skia lays text out by BASELINE, not by a box: y is where the glyphs sit, so the canvas height
  // comes from the font's own ascent/descent rather than a guessed line-height.
  const { width, height, baseline } = useMemo(() => {
    const metrics = font.getMetrics();
    return {
      width: Math.ceil(font.measureText(text).width),
      height: Math.ceil(metrics.descent - metrics.ascent),
      baseline: Math.ceil(-metrics.ascent),
    };
  }, [font, text]);

  // The band is wider than the label so the highlight reads as a soft sweep, not a passing dot; it
  // travels from fully off the left edge to fully off the right one.
  const band = Math.max(60, width * 0.5);
  const travel = width + band * 2;

  // clock % periodMs ramps 0 → 1 every cycle, walking the gradient across the glyphs.
  const startX = useDerivedValue(
    () => -band + ((clock.value % periodMs) / periodMs) * travel,
    [band, travel, periodMs],
  );
  const gradientStart = useDerivedValue(() => vec(startX.value, 0), [startX]);
  const gradientEnd = useDerivedValue(() => vec(startX.value + band, 0), [startX, band]);

  // Un canvas de ancho 0 no dibuja nada: se reserva el alto de la línea para que la fila no colapse.
  if (width === 0) return <View style={{ height: Math.ceil(fontSize * 1.4) }} />;

  return (
    <Canvas style={{ width, height }}>
      <SkiaText x={0} y={baseline} text={text} font={font}>
        <LinearGradient
          start={gradientStart}
          end={gradientEnd}
          colors={[baseColor, highlightColor, baseColor]}
          positions={[0, 0.5, 1]}
        />
      </SkiaText>
    </Canvas>
  );
}

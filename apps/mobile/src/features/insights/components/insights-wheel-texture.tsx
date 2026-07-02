import { View } from "react-native";

import DarkTexture from "@/public/svg/insights-texture-dark-background-circle.svg";
import LightTexture from "@/public/svg/insights-texture-light-background-circle.svg";

// The exact designer halftone (public/svg/insights-texture-{light,dark}-background-circle.svg) —
// a radial diamond grid whose dots grow toward the center, imported as-is via
// react-native-svg-transformer (a hand-rolled <Pattern> couldn't reproduce that radial variation).
// The files' opaque background rects were stripped so only the diamonds remain, overlaying the
// wheel's gradient blob. Clipped to the content circle by a borderRadius+overflow:hidden wrapper
// (the SVG itself is rectangular; the halftone must only show INSIDE the ring).
export function InsightsWheelTexture({
  cx,
  cy,
  radius,
  isDark,
}: {
  cx: number;
  cy: number;
  radius: number;
  isDark: boolean;
}) {
  const diameter = radius * 2;
  const Texture = isDark ? DarkTexture : LightTexture;
  // The halftone is RADIAL — diamonds shrink toward the pattern's edges, so at 1:1 they fade out
  // near the bottom/edges of the circle and leave it looking empty there. Render the texture LARGER
  // than the clip circle and center it, so the dense central band is pushed outward to cover the
  // whole visible circle and only the faint outer diamonds get cropped away.
  const TEXTURE_SCALE = 1.25;
  const scaled = diameter * TEXTURE_SCALE;
  const inset = (scaled - diameter) / 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: cx - radius,
        top: cy - radius,
        width: diameter,
        height: diameter,
        borderRadius: radius,
        overflow: "hidden",
        // Solid fill BEHIND the halftone diamonds (theme-inverted): deep near-black teal on dark,
        // plain white on light — a clean base the diamonds read against.
        backgroundColor: isDark ? "#021B18" : "#FFFFFF",
      }}
    >
      {/* "slice" = cover: fill, crop overflow, keep the diamonds undistorted. Scaled up + centered
          so the dense middle of the radial pattern reaches the circle's edges. */}
      <Texture
        width={scaled}
        height={scaled}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", left: -inset, top: -inset }}
      />
    </View>
  );
}

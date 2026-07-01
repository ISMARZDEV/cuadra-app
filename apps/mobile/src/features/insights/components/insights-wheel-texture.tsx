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
      }}
    >
      {/* "slice" = cover: fill the circle, crop overflow, keep the diamonds undistorted. */}
      <Texture width={diameter} height={diameter} preserveAspectRatio="xMidYMid slice" />
    </View>
  );
}

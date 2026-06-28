import MaskedView from "@react-native-masked-view/masked-view";
import { useColorScheme } from "nativewind";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { GlassSurface } from "@/components/ui/glass-surface";

// EXACT navbar silhouette from the design SVG (assets/noth curvatura navbar.svg).
// One continuous, smooth wave (cubic béziers, no peaks/corners). The central concave dip is
// concentric with the center circle below — do NOT hand-tune; this is the source of truth.
const NAVBAR_PATH =
  "M167.337 72.2178C194.719 72.2174 221.724 41.2692 249.046 43.0761C273.971 44.7244 295.131 46.8131 310.22 48.5131C324.495 50.1213 335 62.2647 335 76.6296C335 92.6277 322.031 105.597 306.033 105.597H28.9671C12.969 105.597 0 92.6277 0 76.6296C0 62.2647 10.5056 50.1213 24.7802 48.513C39.8045 46.8202 60.8487 44.742 85.635 43.0969C112.952 41.2839 139.959 72.2178 167.337 72.2178Z";

// Design viewBox + the center circle (the sphere/logo slot the dip is concentric with).
export const NAVBAR_VIEWBOX = { width: 335, height: 106 } as const;
export const NAVBAR_ASPECT = NAVBAR_VIEWBOX.height / NAVBAR_VIEWBOX.width; // 0.3164
export const NAVBAR_CIRCLE = { cx: 167.5, cy: 31.5, r: 31.5 } as const;

// Glass/blur clipped to the EXACT notch silhouette via MaskedView (viewBox scales the path,
// so the curve is pixel-faithful at any width). MaskedView flattens the native glass rim, so
// we re-draw a thin light stroke along the same silhouette to restore the "glass edge".
export function NotchedGlass({ width, isInteractive = false }: { width: number; isInteractive?: boolean }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const height = width * NAVBAR_ASPECT;
  const viewBox = `0 0 ${NAVBAR_VIEWBOX.width} ${NAVBAR_VIEWBOX.height}`;
  const rim = isDark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.9)";

  return (
    <View style={{ width, height }}>
      <MaskedView
        style={{ width, height }}
        maskElement={
          <Svg width={width} height={height} viewBox={viewBox}>
            <Path d={NAVBAR_PATH} fill="#ffffff" />
          </Svg>
        }
      >
        <GlassSurface style={{ width, height }} isInteractive={isInteractive} />
      </MaskedView>
      {/* Glass rim — restores the bright edge the mask clips off. */}
      <Svg
        width={width}
        height={height}
        viewBox={viewBox}
        style={{ position: "absolute", top: 0, left: 0 }}
        pointerEvents="none"
      >
        <Path d={NAVBAR_PATH} fill="none" stroke={rim} strokeWidth={1} />
      </Svg>
    </View>
  );
}

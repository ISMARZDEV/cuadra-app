import * as Haptics from "expo-haptics";
import { useColorScheme } from "nativewind";
import { useId } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The scalloped/flower "coin" FAB — exact path traced from the reference SVGs
// (public/svg/dark-plus-coin.svg, light-plus-coin.svg): a wobbly blob outline (translucent mint
// fill + a 4-stop gradient stroke) with a "+" cross drawn on top, NOT the circle-overlap hack this
// used before. Two full shape variants (dark/light differ slightly in their own right — 72x72 vs
// 75x75 viewBox — not just recolored) selected by theme; `size` scales the whole viewBox uniformly.
const DARK_BLOB =
  "M11.7055 23.7702C11.2737 21.8252 11.34 19.8026 11.8982 17.89C12.4565 15.9775 13.4886 14.2368 14.8989 12.8295C16.3092 11.4221 18.052 10.3936 19.9657 9.8394C21.8795 9.28516 23.9022 9.22309 25.8463 9.65896C26.9163 7.98543 28.3905 6.6082 30.1328 5.65422C31.8751 4.70023 33.8295 4.2002 35.8159 4.2002C37.8023 4.2002 39.7567 4.70023 41.499 5.65422C43.2413 6.6082 44.7154 7.98543 45.7855 9.65896C47.7325 9.22119 49.7587 9.28298 51.6755 9.83857C53.5923 10.3942 55.3374 11.4255 56.7486 12.8367C58.1597 14.2478 59.1911 15.993 59.7467 17.9098C60.3023 19.8265 60.3641 21.8527 59.9263 23.7998C61.5998 24.8698 62.977 26.344 63.931 28.0863C64.885 29.8286 65.3851 31.783 65.3851 33.7694C65.3851 35.7558 64.885 37.7102 63.931 39.4525C62.977 41.1948 61.5998 42.6689 59.9263 43.739C60.3622 45.6831 60.3001 47.7058 59.7459 49.6195C59.1916 51.5333 58.1631 53.2761 56.7558 54.6864C55.3484 56.0967 53.6078 57.1288 51.6952 57.687C49.7826 58.2453 47.7601 58.3116 45.815 57.8798C44.7464 59.5597 43.2711 60.9429 41.5258 61.9011C39.7806 62.8594 37.8217 63.3617 35.8307 63.3617C33.8396 63.3617 31.8808 62.8594 30.1355 61.9011C28.3902 60.9429 26.915 59.5597 25.8463 57.8798C23.9022 58.3157 21.8795 58.2536 19.9657 57.6994C18.052 57.1451 16.3092 56.1166 14.8989 54.7093C13.4886 53.3019 12.4565 51.5613 11.8982 49.6487C11.34 47.7361 11.2737 45.7136 11.7055 43.7685C10.0191 42.7013 8.63002 41.2249 7.66748 39.4766C6.70494 37.7284 6.2002 35.7651 6.2002 33.7694C6.2002 31.7737 6.70494 29.8104 7.66748 28.0621C8.63002 26.3139 10.0191 24.8374 11.7055 23.7702Z";
const DARK_CROSS_V = "M35.8154 21.9355V45.6022";
const DARK_CROSS_H = "M23.9819 33.769H47.6486";

const LIGHT_BLOB =
  "M13.3051 25.3698C12.8733 23.4248 12.9396 21.4022 13.4978 19.4897C14.0561 17.5771 15.0882 15.8364 16.4985 14.4291C17.9088 13.0217 19.6516 11.9933 21.5653 11.439C23.4791 10.8848 25.5018 10.8227 27.4459 11.2586C28.516 9.58504 29.9901 8.20781 31.7324 7.25383C33.4747 6.29984 35.4291 5.7998 37.4155 5.7998C39.4019 5.7998 41.3563 6.29984 43.0986 7.25383C44.8409 8.20781 46.315 9.58504 47.3851 11.2586C49.3321 10.8208 51.3583 10.8826 53.2751 11.4382C55.1919 11.9938 56.937 13.0251 58.3482 14.4363C59.7594 15.8474 60.7907 17.5926 61.3463 19.5094C61.9019 21.4262 61.9637 23.4523 61.5259 25.3994C63.1994 26.4695 64.5767 27.9436 65.5306 29.6859C66.4846 31.4282 66.9847 33.3826 66.9847 35.369C66.9847 37.3554 66.4846 39.3098 65.5306 41.0521C64.5767 42.7944 63.1994 44.2685 61.5259 45.3386C61.9618 47.2827 61.8997 49.3054 61.3455 51.2191C60.7912 53.1329 59.7627 54.8757 58.3554 56.286C56.948 57.6963 55.2074 58.7284 53.2948 59.2866C51.3822 59.8449 49.3597 59.9112 47.4147 59.4794C46.346 61.1593 44.8707 62.5425 43.1254 63.5007C41.3802 64.459 39.4213 64.9614 37.4303 64.9614C35.4392 64.9614 33.4804 64.459 31.7351 63.5007C29.9898 62.5425 28.5146 61.1593 27.4459 59.4794C25.5018 59.9153 23.4791 59.8532 21.5653 59.299C19.6516 58.7447 17.9088 57.7162 16.4985 56.3089C15.0882 54.9015 14.0561 53.1609 13.4978 51.2483C12.9396 49.3357 12.8733 47.3132 13.3051 45.3681C11.6187 44.3009 10.2296 42.8245 9.26709 41.0762C8.30455 39.328 7.7998 37.3647 7.7998 35.369C7.7998 33.3733 8.30455 31.41 9.26709 29.6617C10.2296 27.9135 11.6187 26.4371 13.3051 25.3698Z";
const LIGHT_CROSS_V = "M37.415 23.5352V47.2018";
const LIGHT_CROSS_H = "M25.5815 35.3687H49.2482";

type ScallopFabProps = {
  label: string; // required, like GlassButton — no hardcoded/English-only default
  onPress?: () => void;
  size?: number;
};

export function ScallopFab({ label, onPress, size = 64 }: ScallopFabProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const gid = `scallopGrad-${useId()}`;
  const viewBoxSize = isDark ? 72 : 75;
  const blob = isDark ? DARK_BLOB : LIGHT_BLOB;
  const crossV = isDark ? DARK_CROSS_V : LIGHT_CROSS_V;
  const crossH = isDark ? DARK_CROSS_H : LIGHT_CROSS_H;
  const crossColor = isDark ? "#FFFFFF" : "#034842";
  // Dark: #BEFFE7 → #03B070 → #BEFFE7 → #00DE8C. Light: #81E6C1 → #02AD6E → #81E6C1 → #00AA6B.
  const gradientStops = isDark
    ? (["#BEFFE7", "#03B070", "#BEFFE7", "#00DE8C"] as const)
    : (["#81E6C1", "#02AD6E", "#81E6C1", "#00AA6B"] as const);

  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[{ width: size, height: size }, animStyle]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
        <Defs>
          <LinearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="2.9%" stopColor={gradientStops[0]} />
            <Stop offset="34.6%" stopColor={gradientStops[1]} />
            <Stop offset="65.2%" stopColor={gradientStops[2]} />
            <Stop offset="98.6%" stopColor={gradientStops[3]} />
          </LinearGradient>
        </Defs>
        <Path d={blob} fill="#00FFA1" fillOpacity={0.14} stroke={`url(#${gid})`} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={crossV} stroke={crossColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={crossH} stroke={crossColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </AnimatedPressable>
  );
}

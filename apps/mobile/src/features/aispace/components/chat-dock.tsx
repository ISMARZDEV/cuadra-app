import { ChevronUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

import type { ChatDockProps } from "../interfaces";

// Collapsible glass panel docked above the input bar (Figma). The translucent GlassSurface lets the
// chat behind it show through. A chevron toggles it: `^` closed → `⌄` open (rotates 180°). The body
// is CONTENT-FIT (natural height — manual height measurement clipped to 0 on the New Arch). The
// reveal is a gentle SPRING (opacity + slide + a subtle scale-in) for a soft, natural open/close; the
// chevron rotates on a timing curve (no overshoot). We keep the body mounted through the close, then
// unmount. Direct spring/easing config only — a bezier/factory easing from the JS thread crashes
// (reanimated v4 gotcha).
export function ChatDock({ open, onToggle, children }: ChatDockProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const chevronColor = isDark ? "#C2FB7E" : "#034842";

  const progress = useSharedValue(open ? 1 : 0); // chevron rotation (timing → no overshoot)
  const reveal = useSharedValue(open ? 1 : 0); // body reveal (spring → natural settle)
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: open ? 260 : 200,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
    reveal.value = withSpring(
      open ? 1 : 0,
      open
        ? { damping: 16, stiffness: 170, mass: 0.7 }
        : { damping: 22, stiffness: 240, mass: 0.6 },
      (done) => {
        if (!open && done) runOnJS(setMounted)(false); // unmount only after the collapse settles
      },
    );
    if (open) setMounted(true);
  }, [open, progress, reveal]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value), // spring can overshoot >1 → clamp so it never flashes
    transform: [
      { translateY: (1 - reveal.value) * 14 },
      { scale: 0.96 + reveal.value * 0.04 }, // subtle scale-in (safe: no GlassView inside the body)
    ],
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    // Stretched horizontally (scaleX) for the wide, flat `^` in the design; rotates 180° on open.
    transform: [{ scaleX: 1.7 }, { rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <View>
      {/* Toggle — centered chevron that rotates to indicate open/closed. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(open ? "chat.dock.close" : "chat.dock.open")}
        onPress={onToggle}
        hitSlop={12}
        style={{ alignSelf: "center", paddingVertical: 6, paddingHorizontal: 24 }}
      >
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronUp} size={28} color={chevronColor} />
        </Animated.View>
      </Pressable>

      {/* Body — content-fit (natural height), springs in. No glass of its own (sits on the bottom
          zone's translucent glass; stacking two native GlassViews over-darkens). */}
      {mounted ? <Animated.View style={bodyStyle}>{children}</Animated.View> : null}
    </View>
  );
}

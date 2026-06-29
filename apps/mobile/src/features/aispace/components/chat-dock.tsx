import { ChevronUp } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

import type { ChatDockProps } from "../interfaces";

// Collapsible glass panel docked above the input bar (Figma). The translucent GlassSurface lets the
// chat behind it show through (the "reflection"). A chevron toggles it: `^` closed → `⌄` open (the
// icon rotates 180°). The body grows/shrinks by HEIGHT — never `scale`, which distorts the native
// liquid glass of an ancestor GlassView (cuadra-glass-button gotcha). Reanimated `entering` is
// unreliable on the New Arch here, so we drive it with a shared value (cuadra-mobile §6).
export function ChatDock({ open, onToggle, children }: ChatDockProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const chevronColor = isDark ? "#C2FB7E" : "#034842";

  const progress = useSharedValue(open ? 1 : 0);
  const contentH = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [open, progress]);

  // The inner content reports its NATURAL height (its own layout is independent of the clipped
  // parent), so we can animate the wrapper from 0 → that height.
  const onMeasure = (e: LayoutChangeEvent) => {
    contentH.value = e.nativeEvent.layout.height;
  };

  const bodyStyle = useAnimatedStyle(() => ({
    height: contentH.value * progress.value,
    opacity: progress.value,
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

      {/* Body — height-animated, clipped. Sits ON the bottom zone's translucent glass (chat-screen),
          so no glass of its own here (stacking two native GlassViews over-darkens). */}
      <Animated.View style={[{ overflow: "hidden" }, bodyStyle]}>
        <View onLayout={onMeasure}>{children}</View>
      </Animated.View>
    </View>
  );
}

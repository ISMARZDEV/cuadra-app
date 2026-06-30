import { ChevronUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
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
// icon rotates 180°). The body is CONTENT-FIT — it renders at its children's natural height (no
// manual height measurement, which clipped to 0 on the New Arch and left the dock empty). The reveal
// is a fade + slide driven by a shared value (reanimated `entering` is unreliable here, cuadra-mobile
// §6); we keep the body mounted through the close animation, then unmount.
export function ChatDock({ open, onToggle, children }: ChatDockProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const chevronColor = isDark ? "#C2FB7E" : "#034842";

  const progress = useSharedValue(open ? 1 : 0);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setMounted)(false); // unmount only after the collapse animation finishes
      });
    }
  }, [open, progress]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }], // slides up into place as it opens
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

      {/* Body — content-fit (natural height), fades + slides in. No glass of its own (it sits on the
          bottom zone's translucent glass; stacking two native GlassViews over-darkens). */}
      {mounted ? <Animated.View style={bodyStyle}>{children}</Animated.View> : null}
    </View>
  );
}

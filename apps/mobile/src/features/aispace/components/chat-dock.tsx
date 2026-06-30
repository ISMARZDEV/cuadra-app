import * as Haptics from "expo-haptics";
import { Minus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { sounds } from "@/lib/sounds";
import { t } from "@/i18n";

import type { ChatDockProps } from "../interfaces";

// Collapsible glass panel docked above the input bar (Figma). The translucent GlassSurface lets the
// chat behind it show through. A small, dim MINUS handle toggles it (grabber style — no rotation).
// The body is CONTENT-FIT (natural height — manual height measurement clipped to 0 on the New Arch).
// The reveal is a gentle SPRING (opacity + slide + a subtle scale-in) for a soft, natural open/close;
// we keep the body mounted through the close, then unmount. Direct spring config only — a
// bezier/factory easing from the JS thread crashes (reanimated v4 gotcha).
export function ChatDock({ open, onToggle, children }: ChatDockProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const handleColor = isDark ? "#C2FB7E" : "#034842";

  const reveal = useSharedValue(open ? 1 : 0); // body reveal (spring → natural settle)
  const [mounted, setMounted] = useState(open);
  const wasOpen = useRef(open);

  useEffect(() => {
    // On open (false→true): a light haptic + a tick, like the orb reveal. On close (true→false):
    // just the haptic — same light tap, no sound.
    if (open && !wasOpen.current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sounds.dock();
    } else if (!open && wasOpen.current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    wasOpen.current = open;
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
  }, [open, reveal]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value), // spring can overshoot >1 → clamp so it never flashes
    transform: [
      { translateY: (1 - reveal.value) * 14 },
      { scale: 0.96 + reveal.value * 0.04 }, // subtle scale-in (safe: no GlassView inside the body)
    ],
  }));

  return (
    <View>
      {/* Toggle — a small, dim minus handle (grabber style), no rotation. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(open ? "chat.dock.close" : "chat.dock.open")}
        onPress={onToggle}
        hitSlop={12}
        style={{ alignSelf: "center", paddingTop: 10, paddingBottom: 4, paddingHorizontal: 24 }}
      >
        <View style={{ opacity: 0.5 }}>
          <Icon as={Minus} size={22} color={handleColor} />
        </View>
      </Pressable>

      {/* Body — content-fit (natural height), springs in. No glass of its own (sits on the bottom
          zone's translucent glass; stacking two native GlassViews over-darkens). */}
      {mounted ? <Animated.View style={bodyStyle}>{children}</Animated.View> : null}
    </View>
  );
}

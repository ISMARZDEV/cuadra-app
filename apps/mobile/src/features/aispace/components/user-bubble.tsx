import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { GlassSurface } from "@/components/ui/glass-surface";

import { CHAT_BODY } from "../chat-typography";

// Rise + fade the bubble into place on mount. useSharedValue + useAnimatedStyle + withSpring — NOT
// reanimated `entering` layout animations, which don't fire dependably on the New Architecture here
// (cuadra-mobile §6, same primitives as streaming-text.tsx/typing-indicator.tsx). Only a NEWLY sent
// message mounts (React reuses earlier bubbles by key), so only it plays the entrance.
// Spring (not withTiming) — same recipe as chat-empty-state.tsx's widget entrance, the fluid feel
// this screen already established; a fixed-duration curve reads more mechanical by comparison.
const ENTER_SPRING = { damping: 16, stiffness: 170, mass: 0.6 };
const ENTER_RISE_PX = 36;

// User message — right-aligned liquid glass bubble.
export function UserBubble({ text }: { text: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, ENTER_SPRING);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    // withSpring overshoots past 1 (the bounce) — clamp opacity so it never reads as flicker.
    opacity: Math.min(1, Math.max(0, progress.value)),
    transform: [{ translateY: (1 - progress.value) * ENTER_RISE_PX }],
  }));

  return (
    <Animated.View className="w-full flex-row justify-end px-3 py-2" style={style}>
      <GlassSurface style={{ maxWidth: "80%", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 }} intensity={50}>
        <Text selectable className="text-lg leading-6 text-text" style={CHAT_BODY}>{text}</Text>
      </GlassSurface>
    </Animated.View>
  );
}

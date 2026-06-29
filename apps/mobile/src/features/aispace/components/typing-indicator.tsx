import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { t } from "@/i18n";

const DOT_COUNT = 3;
const DOT_SIZE = 8;
const RISE = 6; // how high each dot lifts at the crest of the wave (px)
const STEP_MS = 320; // up/down half-period — the whole dot cycle is 2× this
const STAGGER_MS = 150; // delay between dots → the crest travels left→right like a wave

// One dot in the wave: lifts up + brightens, then falls, forever — offset from its neighbours by
// `index * STAGGER_MS` so the crest ripples across the three dots. Driven by useSharedValue +
// withRepeat (the primitives that work on the New Architecture here; reanimated `entering` does NOT
// — cuadra-mobile §6).
function WaveDot({ index, color }: { index: number; color: string }) {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withDelay(
      index * STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: STEP_MS, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: STEP_MS, easing: Easing.inOut(Easing.quad) }),
        ),
        -1, // forever
        false,
      ),
    );
  }, [phase, index]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -phase.value * RISE }],
    opacity: 0.35 + phase.value * 0.65,
  }));

  return (
    <Animated.View
      style={[
        { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

// Loading indicator shown while a turn is in flight but the agent hasn't produced anything yet
// (use-chat `isThinking`). Three dots ripple in a wave. The whole group fades + scales in when it
// appears and fades out when it leaves — we keep it mounted for the fade-out (deferred unmount via
// setTimeout, NOT runOnJS) so BOTH transitions read smoothly and hand off to the first agent word.
export function TypingIndicator({ visible }: { visible: boolean }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const dotColor = isDark ? "#9CA3AF" : "#6B7280"; // muted, matches the agent text tone

  // `rendered` keeps the node alive through the exit fade after `visible` flips false.
  const [rendered, setRendered] = useState(visible);
  const enter = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      enter.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
      return;
    }
    enter.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) });
    const id = setTimeout(() => setRendered(false), 180);
    return () => clearTimeout(id);
  }, [visible, enter]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.9 + enter.value * 0.1 }],
  }));

  if (!rendered) return null;

  return (
    <View className="w-full px-3 py-2">
      <Animated.View
        accessibilityLabel={t("chat.a11y.loading")}
        className="flex-row items-center"
        style={[{ gap: 6 }, containerStyle]}
      >
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <WaveDot key={i} index={i} color={dotColor} />
        ))}
      </Animated.View>
    </View>
  );
}

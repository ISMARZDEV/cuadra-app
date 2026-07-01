import * as Haptics from "expo-haptics";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View, type View as RNView } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

// The app-wide "more info" affordance (public/svg/icon-more-info-tooltip.svg) — a small lime
// circle badge with an "i" glyph. Tapping it opens an animated tooltip bubble anchored near the
// icon, with a light haptic. Uses RN's `Modal` (not an absolutely-positioned sibling View) so the
// bubble can escape a parent's `overflow: hidden` — every Insights card (InsightsCardShell) clips
// its content, and this icon usually sits near a card's edge.
const BADGE_SIZE = 17;

type InfoTooltipProps = {
  message: string;
  label: string; // accessibility label for the badge itself (e.g. "More info")
};

export function InfoTooltip({ message, label }: InfoTooltipProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const badgeRef = useRef<RNView>(null);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = visible
      ? withSpring(1, { damping: 16, stiffness: 260, mass: 0.6 })
      : withTiming(0, { duration: 120 });
  }, [visible, progress]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + progress.value * 0.15 }],
  }));

  const open = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Show immediately — don't gate visibility on measure()'s callback. It's a native-only API
    // with no meaningful jsdom equivalent (its callback never fires under test), and even on
    // device there's no reason to make the user wait on it: position defaults to (0,0) and
    // upgrades to the real anchor the instant measure() resolves, which is effectively the same
    // frame on a real device.
    setVisible(true);
    badgeRef.current?.measure((_x, _y, _w, h, pageX, pageY) => {
      setAnchor({ x: pageX, y: pageY + h + 6 });
    });
  };
  const close = () => setVisible(false);

  return (
    <>
      <Pressable ref={badgeRef} accessibilityRole="button" accessibilityLabel={label} onPress={open}>
        <Svg width={BADGE_SIZE} height={BADGE_SIZE} viewBox="0 0 17 17">
          <Circle cx={8.4} cy={8.4} r={8.4} fill="#C2FB7E" />
          <Circle
            cx={8.3}
            cy={8.3}
            r={5.9}
            stroke="#007E62"
            strokeWidth={1.18}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path d="M8.3 10.66V8.3" stroke="#007E62" strokeWidth={1.18} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M8.3 5.94H8.31" stroke="#007E62" strokeWidth={1.18} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>

      <Modal transparent visible={visible} animationType="none" onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel={label}>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: Math.max(12, anchor.x - 100),
                top: anchor.y,
                maxWidth: 220,
                backgroundColor: isDark ? "#0F1F1A" : "#FFFFFF",
                borderWidth: 1,
                borderColor: "#C2FB7E",
                borderRadius: 14,
                borderCurve: "continuous",
                paddingHorizontal: 12,
                paddingVertical: 10,
              },
              bubbleStyle,
            ]}
          >
            <Text className="text-text" style={{ fontSize: 12, lineHeight: 16 }}>
              {message}
            </Text>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

import { FlaskConical } from "lucide-react-native";
import { useRef } from "react";
import { PanResponder, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";

import { useDevMockStore } from "../use-dev-mock-store";

const BUBBLE_SIZE = 48;
// Below this total finger movement, a release is a TAP (toggle), not a DRAG (reposition) — same
// tap-vs-drag split the chat screen's own PanResponder drawer already relies on.
const TAP_THRESHOLD_PX = 6;
// Resting inset from the screen edge once snapped — Expo Go's own dev-menu bubble sits slightly
// inset too, not flush against the edge.
const EDGE_MARGIN = 8;

// Dev-only design-preview switch — render this ONLY behind `__DEV__`, as a SIBLING AFTER the
// whole `<Tabs>` navigator in app/(tabs)/_layout.tsx (NOT inside insights-screen.tsx). The custom
// tab bar (CuadraTabBar) is mounted as the LAST sibling inside expo-router's BottomTabView, after
// the entire screens container — so it paints on top of anything nested INSIDE a screen regardless
// of that screen's own zIndex (zIndex only reorders siblings sharing the same parent; the tab bar
// is a different subtree entirely). Being a later sibling of the ENTIRE `<Tabs>` output — screens
// AND tab bar both — is what lets this paint on top, with plain RN sibling stacking, no tricks.
//
// Do NOT wrap this in a `<Modal>` to "solve" the same stacking problem — tried that, and a
// transparent Modal captures the FULL SCREEN's touches at the native level (a separate
// UIWindow/Dialog), even with `pointerEvents="box-none"` on its content — it froze the entire
// Insights screen (nothing tappable, no navigation). A plain absolutely-positioned View only
// claims touches within its own bounds, which is what we actually want.
//
// Styled + behaves like Expo Go's own floating dev-menu bubble: a small translucent circle you can
// drag to any edge/corner, tap (no drag) to toggle. Draggable via PanResponder — this repo has no
// react-native-gesture-handler dependency (insights-carousel.tsx), so plain PanResponder + a
// reanimated shared value for position is the established pattern (cuadra-tab-bar.tsx's own drag).
export function DevMockToggle() {
  const enabled = useDevMockStore((s) => s.enabled);
  const toggle = useDevMockStore((s) => s.toggle);
  const { width, height } = useWindowDimensions();

  // Starts bottom-right, clear of the floating tab bar — draggable anywhere after that, clamped so
  // it can never leave the visible screen.
  const translateX = useSharedValue(width - BUBBLE_SIZE - EDGE_MARGIN);
  const translateY = useSharedValue(height - BUBBLE_SIZE - 110);
  const dragStart = useRef({ x: 0, y: 0 });
  const totalMove = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { x: translateX.value, y: translateY.value };
        totalMove.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        totalMove.current = Math.abs(gesture.dx) + Math.abs(gesture.dy);
        translateX.value = Math.min(Math.max(dragStart.current.x + gesture.dx, 0), width - BUBBLE_SIZE);
        translateY.value = Math.min(Math.max(dragStart.current.y + gesture.dy, 0), height - BUBBLE_SIZE);
      },
      onPanResponderRelease: () => {
        if (totalMove.current < TAP_THRESHOLD_PX) {
          toggle();
          return;
        }
        // Magnetic snap — settle onto whichever screen edge (left/right) is closer, like Expo
        // Go's own dev-menu bubble does on release.
        const bubbleCenterX = translateX.value + BUBBLE_SIZE / 2;
        const snapToLeft = bubbleCenterX < width / 2;
        translateX.value = withSpring(snapToLeft ? EDGE_MARGIN : width - BUBBLE_SIZE - EDGE_MARGIN, {
          damping: 16,
          stiffness: 180,
        });
      },
    }),
  ).current;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel="Toggle mock data"
      style={[
        {
          position: "absolute",
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          borderRadius: BUBBLE_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(20,20,20,0.78)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
          elevation: 8,
        },
        animStyle,
      ]}
    >
      <Icon as={FlaskConical} size={22} color={enabled ? "#C2FB7E" : "#FFFFFF"} />
    </Animated.View>
  );
}

import { Plus } from "lucide-react-native";
import { Children, type ReactNode, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";

// The 3-card horizontal carousel (insights-ui-navbar.md §3: Accounts / Spaces / Daily Diary) —
// paging Animated.ScrollView + a scrollX-driven dot indicator. `useAnimatedScrollHandler` +
// scroll-driven `useAnimatedStyle` is the SAME primitive family already used app-wide
// (useSharedValue/useAnimatedStyle/withTiming) — NOT reanimated's banned `entering`/`exiting`
// mount-transition presets (cuadra-mobile skill §6), so this is safe on the New Architecture here.
// No react-native-gesture-handler needed — native `pagingEnabled` is sufficient (this repo has no
// RNGH dependency at all; the tab bar's own swipe uses plain PanResponder).
function DotIndicator({
  scrollX,
  count,
  cardWidth,
}: {
  scrollX: SharedValue<number>;
  count: number;
  cardWidth: number;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} cardWidth={cardWidth} />
      ))}
    </View>
  );
}

function Dot({
  index,
  scrollX,
  cardWidth,
}: {
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
}) {
  const style = useAnimatedStyle(() => {
    if (cardWidth === 0) return { opacity: index === 0 ? 1 : 0.35, transform: [{ scale: 1 }] };
    const input = [
      (index - 1) * cardWidth,
      index * cardWidth,
      (index + 1) * cardWidth,
    ];
    const opacity = interpolate(scrollX.value, input, [0.35, 1, 0.35], "clamp");
    const scale = interpolate(scrollX.value, input, [0.8, 1, 0.8], "clamp");
    return { opacity, transform: [{ scale }] };
  });
  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#C2FB7E" }, style]}
    />
  );
}

export function InsightsCarousel({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children);
  const [cardWidth, setCardWidth] = useState(0);
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const onLayout = (e: LayoutChangeEvent) => {
    if (cardWidth === 0) setCardWidth(e.nativeEvent.layout.width);
  };

  return (
    <View onLayout={onLayout}>
      <Animated.ScrollView
        testID="insights-carousel-scroll"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {cards.map((card, i) => (
          // Percentage fallback before the first onLayout measurement (real device: same frame,
          // barely visible; jsdom tests: onLayout never fires at all — ResizeObserver is a no-op
          // stub there — so children must still render, not disappear waiting on a width that
          // will never arrive).
          <View key={i} style={cardWidth > 0 ? { width: cardWidth } : { width: "100%" }}>
            {card}
          </View>
        ))}
      </Animated.ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginTop: 10,
        }}
      >
        <DotIndicator scrollX={scrollX} count={cards.length} cardWidth={cardWidth} />
        {/* Trailing "+" (Figma) — no 4th card exists yet, so it's a static disabled glyph, not a
            functional "add a card" affordance. */}
        <Icon as={Plus} size={14} color="#6B7280" />
      </View>
    </View>
  );
}

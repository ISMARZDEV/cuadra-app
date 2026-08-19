import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The offset lives in the PARENT so dots, parallax and card scaling can all read the same value.
 * Call this once, pass `scrollX` to whatever derives from it.
 */
export function useCarouselOffset() {
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  return { scrollX, scrollHandler };
}

export type SnapCarouselProps = {
  pageWidth: number;
  /** From `useCarouselOffset()` in the parent. */
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * A paged horizontal carousel that publishes its live offset.
 *
 * Everything downstream reads that offset — never an `onMomentumScrollEnd` page index, which fires
 * after the motion is over and so always arrives late.
 */
export function SnapCarousel({
  pageWidth,
  scrollHandler,
  children,
  style,
  contentContainerStyle,
}: SnapCarouselProps) {
  return (
    <Animated.ScrollView
      horizontal
      pagingEnabled
      // Stops two stacked carousels from stealing each other's diagonal swipes.
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={pageWidth}
      snapToAlignment="start"
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={[styles.scroller, style]}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
});

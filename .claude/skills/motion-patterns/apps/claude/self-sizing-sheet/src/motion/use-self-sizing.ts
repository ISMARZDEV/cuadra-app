import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BACKDROP_DIM, RESIZE } from './springs';

/**
 * A sheet whose height FOLLOWS its content.
 *
 * The content is measured off-screen with onLayout and the container animates to that number, so
 * adding or removing a row is not a special case — it is the same height change as opening.
 *
 * ⭐ Measure the CONTENT, never animate the container's own layout height. A container that both
 * animates its height and derives it from its children feeds its own measurement back into itself
 * and oscillates. The measured node must be layout-independent of the animated one.
 */
export function useSelfSizingSheet(open: boolean) {
  // Content height changes on layout, not per frame — React state is its correct home.
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setContentHeight((prev) => (prev === h ? prev : h));
  }, []);

  // One driver. Open/close and every content change are the same event.
  const target = open ? contentHeight : 0;
  height.value = reducedMotion ? target : withSpring(target, RESIZE);

  const sheetStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  /**
   * The rows are NOT animated. They sit at their final positions inside a container with
   * `overflow: hidden`, and the container's rising edge is what reveals them.
   * ⭐ This is the cheapest possible reveal: N rows cost zero animations.
   */
  const progress = useDerivedValue(() =>
    contentHeight > 0 ? height.value / contentHeight : 0,
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_DIM,
  }));

  return { onContentLayout, sheetStyle, backdropStyle, progress, contentHeight };
}

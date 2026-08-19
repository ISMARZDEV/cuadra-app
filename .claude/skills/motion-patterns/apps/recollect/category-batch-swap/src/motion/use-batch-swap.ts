import { useEffect } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  CARD_ENTER_SCALE,
  CARD_SWAP,
  QUADRANT_STAGGER_MS,
} from './timings';

export type BatchSwapSlot = {
  /** 0 = settled, 1 = mid-swap. */
  progress: SharedValue<number>;
  style: ReturnType<typeof useAnimatedStyle>;
};

/**
 * One slot of a grid whose CONTENTS are replaced in place. The slot never moves.
 *
 * ⭐ The stagger is a function of the slot's index, applied with `withDelay` — never a chain of
 * setTimeout, which is the anti-pattern this method calls out by name.
 */
export function useBatchSwapSlot(index: number, generation: number): BatchSwapSlot {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    // Out, then back: one value describing a whole exchange, so the two halves cannot desync.
    progress.value = withDelay(
      index * QUADRANT_STAGGER_MS,
      withSequence(withTiming(1, { duration: 140 }), withSpring(0, CARD_SWAP)),
    );
  }, [generation, index, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, CARD_ENTER_SCALE]) }],
  }));

  return { progress, style };
}

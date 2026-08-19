import { useEffect } from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { CARD_POP, STAGGER_MS } from './springs';

/**
 * Staggered entry with overshoot. One progress PER PIECE — never a shared integer step.
 * Opacity is clamped; the transforms are allowed past 1, and that excess IS the pop.
 */
export function useStaggerIn(index: number, ready = true) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!ready) return;
    progress.value = reducedMotion
      ? 1
      : withDelay(index * STAGGER_MS, withSpring(1, CARD_POP));
  }, [ready, index, reducedMotion, progress]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [18, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
    ],
  }));
}

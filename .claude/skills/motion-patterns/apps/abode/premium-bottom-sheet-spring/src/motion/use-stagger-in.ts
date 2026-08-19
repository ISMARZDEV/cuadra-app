// motion/use-stagger-in.ts
import { useEffect } from 'react';
import {
  Extrapolation, interpolate, useAnimatedStyle, useReducedMotion,
  useSharedValue, withDelay, withSpring,
} from 'react-native-reanimated';
import { CONTENT_POP, STAGGER_MS } from './springs';

/** Staggered entry with overshoot. One progress PER PIECE — no shared counter. */
export function useStaggerIn(index: number, ready = true) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!ready) return;
    progress.value = reducedMotion
      ? 1
      : withDelay(index * STAGGER_MS, withSpring(1, CONTENT_POP));
  }, [ready, index, reducedMotion, progress]);

  return useAnimatedStyle(() => ({
    // Opacity is CLAMPED; transforms are allowed past 1 — that excess IS the pop.
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [18, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
    ],
  }));
}

import { useEffect } from 'react';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * ONE clock for the whole system, whatever the satellite count.
 *
 * Easing MUST be linear: any curve makes each revolution speed up and slow down, which the eye
 * reads as a stutter once per lap. Perpetual motion is linear; only transient motion springs.
 */
export function useOrbitClock(periodMs = 8000, running = true): SharedValue<number> {
  const clock = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || !running) {
      // Reduce Motion: the orbit is pure decoration, so it stops entirely.
      clock.value = 0;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: periodMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [periodMs, running, reducedMotion, clock]);

  return clock;
}

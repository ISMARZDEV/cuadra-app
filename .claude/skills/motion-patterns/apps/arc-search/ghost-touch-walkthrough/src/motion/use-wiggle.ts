import { useEffect, useRef } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * iOS jiggle mode.
 *
 * The phase is RANDOM PER ICON and fixed once. If every icon rotates in lockstep the eye catches it
 * instantly and the whole tutorial reads as a cheap GIF — this is the single detail that sells it.
 */
export function useWiggle(enabled: boolean, amplitudeDeg = 2, periodMs = 130) {
  const rotation = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  // Fixed at mount so the icon keeps its own phase for the life of the screen.
  const phaseMs = useRef(Math.random() * periodMs).current;

  useEffect(() => {
    if (!enabled || reducedMotion) {
      rotation.value = withTiming(0, { duration: 120 });
      return;
    }
    const half = periodMs / 2;
    rotation.value = withDelay(
      phaseMs,
      withRepeat(
        withSequence(
          withTiming(-1, { duration: half, easing: Easing.linear }),
          withTiming(1, { duration: periodMs, easing: Easing.linear }),
          withTiming(0, { duration: half, easing: Easing.linear }),
        ),
        -1,
        false,
      ),
    );
  }, [enabled, reducedMotion, periodMs, phaseMs, rotation]);

  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * amplitudeDeg}deg` }],
  }));
}

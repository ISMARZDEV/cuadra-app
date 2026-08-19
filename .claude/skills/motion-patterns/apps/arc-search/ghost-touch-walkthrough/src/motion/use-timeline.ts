import { useEffect } from 'react';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type TimelineOptions = {
  /** Total length of the script, in milliseconds. */
  durationMs: number;
  /** Pause before the script replays. */
  loopGapMs?: number;
  loop?: boolean;
  playing?: boolean;
};

/**
 * ONE master clock in milliseconds. Every actor interpolates its own keyframes against it.
 *
 * This is why chained setTimeouts are the wrong answer: they cannot rewind, cannot pause, cannot be
 * scrubbed, and they live on the JS thread. A clock can do all four and never leaves the UI thread.
 */
export function useTimeline({
  durationMs,
  loopGapMs = 900,
  loop = true,
  playing = true,
}: TimelineOptions): SharedValue<number> {
  const clock = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || !playing) {
      // Reduce Motion: hold at the end state. The instructions must survive without the film.
      clock.value = reducedMotion ? durationMs : 0;
      return;
    }
    clock.value = 0;
    const pass = withSequence(
      withTiming(durationMs, { duration: durationMs, easing: Easing.linear }),
      withDelay(loopGapMs, withTiming(0, { duration: 0 })),
    );
    clock.value = loop ? withRepeat(pass, -1, false) : pass;
  }, [durationMs, loopGapMs, loop, playing, reducedMotion, clock]);

  return clock;
}

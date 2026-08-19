import { useEffect, useState } from 'react';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ROLL_DISTANCE, WORD_HOLD_MS, WORD_ROLL_MS } from './timings';

/**
 * Cycles through words, rolling each one up and out while the next rolls up and in.
 *
 * ⭐ The word list is React state, not a shared value: it changes on a timer, not per frame, and
 * the worklet only ever reads a number. Capturing the array (or a formatter) in the worklet is
 * the trap this method records — a JS function inside a worklet blows up at runtime.
 */
export function useRollingWord(words: readonly string[]) {
  const [index, setIndex] = useState(0);
  const roll = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (words.length < 2) return;
    const id = setInterval(() => {
      if (reducedMotion) {
        setIndex((i) => (i + 1) % words.length);
        return;
      }
      roll.value = withTiming(
        1,
        { duration: WORD_ROLL_MS, easing: Easing.bezier(0, 0, 0.58, 1) },
        (finished) => {
          if (finished) roll.value = 0;
        },
      );
      // The swap lands at the midpoint, while the outgoing word is already transparent.
      setTimeout(() => setIndex((i) => (i + 1) % words.length), WORD_ROLL_MS / 2);
    }, WORD_HOLD_MS + WORD_ROLL_MS);
    return () => clearInterval(id);
  }, [reducedMotion, roll, words.length]);

  const wordStyle = useAnimatedStyle(() => ({
    opacity: interpolate(roll.value, [0, 0.5, 1], [1, 0, 1]),
    transform: [
      { translateY: interpolate(roll.value, [0, 0.5, 1], [0, -ROLL_DISTANCE, ROLL_DISTANCE]) },
    ],
  }));

  return { word: words[index], wordStyle, index };
}

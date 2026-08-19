import { useEffect } from 'react';
import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  CARET_BLINK_MS,
  CARET_SCALE_X,
  CARET_SCALE_Y,
  MARK_TO_CARET,
} from './springs';

export type MarkToCaret = {
  /** 0 = the brand mark, 1 = the caret. THE driver. */
  progress: SharedValue<number>;
  /** Non-uniform contraction, applied to the mark layer. */
  markStyle: ReturnType<typeof useAnimatedStyle>;
  /** The caret layer, which fades in as the mark fades out. */
  caretStyle: ReturnType<typeof useAnimatedStyle>;
  toCaret: () => void;
  toMark: () => void;
};

/**
 * ONE driver — `progress` — for the whole morph, with the blink layered on top as an independent
 * perpetual clock.
 *
 * ⭐ HOW THE MORPH IS FAKED, stated plainly. The reference interpolates the glyph's PATH: a
 * bookmark's notch flattens as it narrows. Non-uniformly scaling a bookmark does not produce a
 * caret, it produces a squashed bookmark — so this crossfades two layers while BOTH carry the same
 * measured scale. The silhouette is right at both ends and approximate in the middle, which for a
 * 200ms transition on a 5px-wide target is invisible. Use Skia `interpolatePath` between two SVG
 * paths if the mark is complex enough for the cheat to show.
 */
export function useMarkToCaret(): MarkToCaret {
  const progress = useSharedValue(0);
  const blinkClock = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // ⭐ Perpetual motion is LINEAR. A sawtooth thresholded to on/off is a blink; the same clock
    // eased would read as a pulsing glow, which is a different (and wrong) idea.
    blinkClock.value = withRepeat(
      withTiming(1, { duration: CARET_BLINK_MS * 2, easing: Easing.linear }),
      -1,
      false,
    );
  }, [blinkClock]);

  const settle = (to: number) => {
    if (reducedMotion) {
      progress.value = to;
      return;
    }
    progress.value = withSpring(to, MARK_TO_CARET);
  };

  const toCaret = () => settle(1);
  const toMark = () => settle(0);

  /** Hard on/off. The caret is only allowed to blink once it IS a caret. */
  const blink = useDerivedValue(() =>
    progress.value > 0.98 && blinkClock.value >= 0.5 ? 0 : 1,
  );

  const markStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [1, 0]),
    transform: [
      { scaleX: interpolate(progress.value, [0, 1], [1, CARET_SCALE_X]) },
      { scaleY: interpolate(progress.value, [0, 1], [1, CARET_SCALE_Y]) },
    ],
  }));

  const caretStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.45, 1], [0, 1]) * blink.value,
    transform: [
      { scaleX: interpolate(progress.value, [0, 1], [1 / CARET_SCALE_X, 1]) },
      { scaleY: interpolate(progress.value, [0, 1], [1 / CARET_SCALE_Y, 1]) },
    ],
  }));

  return { progress, markStyle, caretStyle, toCaret, toMark };
}

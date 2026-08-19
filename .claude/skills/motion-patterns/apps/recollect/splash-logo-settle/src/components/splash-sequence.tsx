import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { REVEAL_STAGGER_MS, SETTLE_EASING, SETTLE_MS } from '../motion/timing';

export type SplashSequenceProps = {
  /** True once the real work behind the splash is done. See `useSplashHandoff`. */
  ready: boolean;
  /** Called after the logo has settled and the handoff is complete. */
  onFinished?: () => void;
  /** The brand mark. It must land exactly where the next screen wants it. */
  logo: ReactNode;
  /** Scale the logo starts at, before settling to 1. */
  fromScale?: number;
  /** How far the logo travels to its resting place. */
  fromTranslateY?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Logo settle + handoff.
 *
 * The point of the pattern is that the logo's END position is its position on the NEXT screen, so
 * the transition is one continuous move — never a splash that fades out and a header that fades in.
 */
export function SplashSequence({
  ready,
  onFinished,
  logo,
  fromScale = 1.4,
  fromTranslateY = 0,
  style,
}: SplashSequenceProps) {
  const settle = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!ready) return;

    const finish = () => onFinished?.();

    if (reducedMotion) {
      // Nothing is lost by removing motion here — a splash is the safest place to drop it.
      settle.value = 1;
      finish();
      return;
    }

    settle.value = withTiming(
      1,
      { duration: SETTLE_MS, easing: SETTLE_EASING },
      (completed) => {
        'worklet';
        if (completed) runOnJS(finish)();
      },
    );
  }, [ready, reducedMotion, onFinished, settle]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(settle.value, [0, 1], [fromScale, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(settle.value, [0, 1], [fromTranslateY, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={[styles.stage, style]}>
      <Animated.View style={logoStyle}>{logo}</Animated.View>
    </View>
  );
}

/**
 * Staggered reveal for the first screen's content, once the logo has settled.
 * Same ladder as any staggered entry: one progress per piece, offset by index.
 */
export function useSplashReveal(index: number, start: boolean) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!start) return;
    progress.value = reducedMotion
      ? 1
      : withDelay(
          index * REVEAL_STAGGER_MS,
          withTiming(1, { duration: SETTLE_MS, easing: SETTLE_EASING }),
        );
  }, [start, index, reducedMotion, progress]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0], Extrapolation.CLAMP) }],
  }));
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

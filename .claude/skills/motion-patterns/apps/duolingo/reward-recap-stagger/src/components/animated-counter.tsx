import { useEffect, type ComponentType } from 'react';
import {
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { COUNT_DURATION_MS } from '../motion/springs';

// `text` is a real native prop of TextInput, but it is not part of its public TS surface, so the
// component is re-typed to admit it. Whitelisting is what lets Reanimated write it from the UI thread.
Animated.addWhitelistedNativeProps({ text: true });

type CounterInputProps = TextInputProps & { text?: string };

const AnimatedTextInput = Animated.createAnimatedComponent(
  TextInput as unknown as ComponentType<CounterInputProps>,
);

export type AnimatedCounterProps = {
  /** The number to count up to. */
  value: number;
  /** Rendered before the number, e.g. "+" or "$". Must be a plain string (it is read in a worklet). */
  prefix?: string;
  /** Rendered after the number, e.g. "%" or " XP". */
  suffix?: string;
  durationMs?: number;
  delayMs?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * A number that animates on the UI THREAD.
 *
 * React Native cannot animate <Text> content without a re-render per frame, so the only 60fps route
 * is an animated TextInput driven by useAnimatedProps. Never `runOnJS` + `setState` here.
 */
export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  durationMs = COUNT_DURATION_MS,
  delayMs = 0,
  style,
}: AnimatedCounterProps) {
  const shown = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      shown.value = value;
      return;
    }
    shown.value = withDelay(
      delayMs,
      // withTiming, not withSpring: the value must never overshoot its target.
      withTiming(value, { duration: durationMs, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, durationMs, delayMs, reducedMotion, shown]);

  const animatedProps = useAnimatedProps<CounterInputProps>(() => ({
    text: `${prefix}${Math.round(shown.value)}${suffix}`,
  }));

  return (
    <AnimatedTextInput
      editable={false}
      style={[styles.base, style]}
      // The initial paint before the first worklet frame.
      defaultValue={`${prefix}0${suffix}`}
      animatedProps={animatedProps}
      accessible
      accessibilityLabel={`${prefix}${value}${suffix}`}
    />
  );
}

const styles = StyleSheet.create({
  base: { padding: 0, margin: 0 },
});

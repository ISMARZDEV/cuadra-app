import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { valueAt, type Track } from '../motion/timeline';

export type GhostPointerProps = {
  clock: SharedValue<number>;
  /** Pointer position over time. */
  x: Track;
  y: Track;
  /** 0 = released, 1 = pressed. Drives the contact ring. */
  press: Track;
  size?: number;
  color?: string;
};

/**
 * The fake fingertip. It owns no logic — it is a pure reading of the master clock.
 *
 * There is deliberately NO gesture handling anywhere in this pattern: the surface is a recording,
 * and inviting the finger onto a recording it cannot steer is worse than not inviting it at all.
 * The one real interaction worth adding is tap-to-skip, on the stage, not here.
 */
export function GhostPointer({
  clock,
  x,
  y,
  press,
  size = 44,
  color = 'rgba(60,130,255,0.45)',
}: GhostPointerProps) {
  const style = useAnimatedStyle(() => {
    const pressed = valueAt(clock.value, press);
    return {
      transform: [
        { translateX: valueAt(clock.value, x) },
        { translateY: valueAt(clock.value, y) },
        { scale: 1 - pressed * 0.18 },
      ],
      opacity: 0.65 + pressed * 0.35,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pointer,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pointer: { position: 'absolute', top: 0, left: 0 },
});

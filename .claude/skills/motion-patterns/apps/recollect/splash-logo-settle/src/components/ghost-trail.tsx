import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

export type GhostTrailProps = {
  /** 0 -> 1 across the element's travel. */
  progress: SharedValue<number>;
  /** Travel vector, in points. */
  dx: number;
  dy: number;
  /** How many echoes trail behind. 3-4 is convincing; more is waste. */
  copies?: number;
  /** Spacing between echoes, as a fraction of the travel. */
  spacing?: number;
  size: number;
  color: string;
};

/**
 * Fake motion blur.
 *
 * React Native has NO per-frame motion blur. Two honest options: these ghost echoes (cheap, pure
 * Reanimated, convincing at speed) or a real blur ImageFilter in @shopify/react-native-skia, which
 * costs more per frame. Start here; only reach for Skia if the effect carries the brand.
 */
export function GhostTrail({
  progress,
  dx,
  dy,
  copies = 3,
  spacing = 0.06,
  size,
  color,
}: GhostTrailProps) {
  return (
    <>
      {Array.from({ length: copies }, (_, i) => (
        <Echo
          key={i}
          progress={progress}
          dx={dx}
          dy={dy}
          lag={(i + 1) * spacing}
          opacity={0.35 / (i + 1)}
          size={size}
          color={color}
        />
      ))}
    </>
  );
}

type EchoProps = {
  progress: SharedValue<number>;
  dx: number;
  dy: number;
  lag: number;
  opacity: number;
  size: number;
  color: string;
};

function Echo({ progress, dx, dy, lag, opacity, size, color }: EchoProps) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(progress.value - lag, 0);
    return {
      transform: [
        { translateX: dx * t },
        { translateY: dy * t },
        // Stretching along the travel axis is what sells the smear.
        { scaleY: 1 + Math.min(progress.value, 1) * 0.6 },
      ],
      opacity: progress.value > 0 && progress.value < 1 ? opacity : 0,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.echo, { width: size, height: size, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  echo: { position: 'absolute', borderRadius: 8 },
});

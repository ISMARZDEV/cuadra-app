import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import Animated, { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { lensUniforms } from '../motion/model';
import { LIQUID_LENS_SKSL } from '../motion/liquid-lens-shader';
import { useLiquidFocus } from '../motion/use-liquid-focus';

const effect = Skia.RuntimeEffect.Make(LIQUID_LENS_SKSL);

export type LiquidFocusProps = {
  listening: boolean;
  /** Can remain true while processing, after listening becomes false. */
  dimmed: boolean;
  width: number;
  height: number;
  backdrop: ReactNode;
  /** OPAQUE snapshot of ONLY backdrop, same viewport/aspect; caller owns capture/disposal. */
  snapshot: SkImage | null;
  /** Native accessible control/transcript, never included in the snapshot. */
  foreground: ReactNode;
  /** Optional 0..1 modulation. No automatic clock or implied audio dependency. */
  pulse?: SharedValue<number>;
  /** RGB floats in 0..1; use a dark neutral for a dark background. */
  veilColor?: readonly [number, number, number];
};

export function LiquidFocus({
  listening, dimmed, width, height, backdrop, snapshot, foreground, pulse,
  veilColor = [0.96, 0.96, 0.94],
}: LiquidFocusProps) {
  const { progress, lensStyle, dimStyle, reducedMotion } = useLiquidFocus(listening, dimmed);
  const [red, green, blue] = veilColor;
  const uniforms = useDerivedValue(() => ({
    ...lensUniforms(width, height, progress.value, pulse?.value ?? 0, reducedMotion),
    veilColor: [red, green, blue],
  }));
  const blocked = listening || dimmed;

  return (
    <View style={{ width, height }}>
      <View
        style={styles.fill}
        pointerEvents={blocked ? 'none' : 'auto'}
        accessibilityElementsHidden={blocked}
        importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}
      >
        {backdrop}
      </View>
      <Animated.View
        style={[styles.fill, lensStyle]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {snapshot && effect && !reducedMotion ? (
          <Canvas style={styles.fill}>
            <Fill>
              <Shader source={effect} uniforms={uniforms}>
                <ImageShader image={snapshot} fit="fill" rect={{ x: 0, y: 0, width, height }} tx="clamp" ty="clamp" />
              </Shader>
            </Fill>
          </Canvas>
        ) : null}
      </Animated.View>
      <Animated.View style={[styles.fill, styles.dim, dimStyle]} pointerEvents="none" />
      <View style={styles.fill} pointerEvents="box-none">{foreground}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { backgroundColor: '#000000' },
});

import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

export type OrbitGeometry = {
  /** Horizontal radius. */
  rx: number;
  /** Vertical radius. Keep it SMALLER than rx — a circle reads flat, an ellipse reads 3D. */
  ry: number;
  /** Scale at the far side of the orbit. */
  minScale?: number;
  /** Opacity at the far side of the orbit. */
  minOpacity?: number;
};

export type OrbitSatelliteProps = {
  clock: SharedValue<number>;
  /** Position in the ring. */
  index: number;
  /** How many satellites share the ring. */
  count: number;
  geometry: OrbitGeometry;
  children: ReactNode;
};

/**
 * One satellite. Everything it does is DERIVED from the shared clock — it owns no animation.
 * N animations would drift apart and cost N times as much.
 */
export function OrbitSatellite({
  clock,
  index,
  count,
  geometry,
  children,
}: OrbitSatelliteProps) {
  const { rx, ry, minScale = 0.6, minOpacity = 0.45 } = geometry;

  // theta = (clock + phase) * 2pi — the index becomes a phase offset.
  const theta = useDerivedValue(() => (clock.value + index / count) * Math.PI * 2);

  // depth: 0 = far side, 1 = near side. The fake 3D is free — it falls out of sin(theta).
  const depth = useDerivedValue(() => (Math.sin(theta.value) + 1) / 2);

  const style = useAnimatedStyle(() => {
    const d = depth.value;
    return {
      transform: [
        { translateX: Math.cos(theta.value) * rx },
        { translateY: Math.sin(theta.value) * ry },
        { scale: minScale + (1 - minScale) * d },
      ],
      opacity: minOpacity + (1 - minOpacity) * d,
      zIndex: Math.round(d * 100),
    };
  });

  return <Animated.View style={[styles.satellite, style]}>{children}</Animated.View>;
}

export type OrbitProps = {
  clock: SharedValue<number>;
  geometry: OrbitGeometry;
  /** Rendered at the centre of the ring. */
  centre?: ReactNode;
  /** One entry per satellite. */
  satellites: ReactNode[];
  size: number;
  style?: StyleProp<ViewStyle>;
};

export function Orbit({ clock, geometry, centre, satellites, size, style }: OrbitProps) {
  return (
    <View style={[{ width: size, height: size }, styles.stage, style]}>
      {centre}
      {satellites.map((node, i) => (
        <OrbitSatellite
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          clock={clock}
          index={i}
          count={satellites.length}
          geometry={geometry}
        >
          {node}
        </OrbitSatellite>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  satellite: { position: 'absolute' },
});

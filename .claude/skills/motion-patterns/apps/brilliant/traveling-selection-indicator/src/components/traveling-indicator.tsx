import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { HOP_HEIGHT, INDICATOR } from '../motion/springs';

type Slot = { x: number; width: number };

export type TravelingIndicatorProps = {
  /** How many options the row holds. */
  count: number;
  selectedIndex: number;
  /** Renders one option; spread `slotProps` onto its wrapper so it can be measured. */
  renderOption: (index: number, slotProps: { onLayout: (e: LayoutChangeEvent) => void }) => React.ReactNode;
  indicatorStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Set 0 to travel in a straight line instead of hopping. */
  hopHeight?: number;
};

/**
 * ONE highlight that travels. Nothing fades.
 *
 * The alternative — fading a background in on the new option and out on the old — is two objects,
 * and the eye reads it as two objects. A single moving highlight is what makes the control physical.
 */
export function TravelingIndicator({
  count,
  selectedIndex,
  renderOption,
  indicatorStyle,
  style,
  hopHeight = HOP_HEIGHT,
}: TravelingIndicatorProps) {
  // Layouts change on layout, not per frame, so React state is the right home for them.
  const [slots, setSlots] = useState<Slot[]>([]);
  const reducedMotion = useReducedMotion();

  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const from = useSharedValue(0);
  const to = useSharedValue(0);

  const measure = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const { x: sx, width: sw } = event.nativeEvent.layout;
      setSlots((prev) => {
        const next = [...prev];
        if (next[index]?.x === sx && next[index]?.width === sw) return prev;
        next[index] = { x: sx, width: sw };
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const slot = slots[selectedIndex];
    if (!slot) return;

    // First placement must be instant: a selector that assembles itself on mount looks unstable.
    if (width.value === 0) {
      x.value = slot.x;
      width.value = slot.width;
      from.value = slot.x;
      to.value = slot.x;
      return;
    }

    from.value = x.value;
    to.value = slot.x;

    if (reducedMotion) {
      // Still ONE object — it jumps rather than travelling.
      x.value = slot.x;
      width.value = slot.width;
      return;
    }
    x.value = withSpring(slot.x, INDICATOR);
    // Width animates too: options are rarely equal width, and i18n changes them.
    width.value = withSpring(slot.width, INDICATOR);
  }, [selectedIndex, slots, reducedMotion, x, width, from, to]);

  // The arc is what turns a slide into a jump: 0 at both ends, peak in the middle.
  const lift = useDerivedValue(() => {
    const span = to.value - from.value;
    if (span === 0 || hopHeight === 0) return 0;
    const t = Math.min(Math.max((x.value - from.value) / span, 0), 1);
    return -hopHeight * Math.sin(t * Math.PI);
  });

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }, { translateY: lift.value }],
    opacity: width.value === 0 ? 0 : 1,
  }));

  return (
    <View style={[styles.row, style]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, indicatorStyle, animatedStyle]}
      />
      {Array.from({ length: count }, (_, i) => renderOption(i, { onLayout: measure(i) }))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
});

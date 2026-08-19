import { useEffect, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  FOCUS_INDENT,
  MARK_FOCUS_RANGE,
  REDUCED_FADE_MS,
  RESTING_OPACITY,
  RESTING_SCALE,
  SLOT_PITCH,
  STEP_PERIOD_MS,
} from '../motion/timings';
import { signedSlotDistance, useFocusSlot } from '../motion/use-focus-slot';

export type FocusSlotItem = {
  key: string;
  label: string;
};

export type FocusSlotTickerProps = {
  /** At least 4, so the ring's recycle jump stays behind a fully transparent row. */
  items: readonly FocusSlotItem[];
  rowPitch?: number;
  periodMs?: number;
  /** How far the label slides right to make room for the mark when it takes focus. */
  indent?: number;
  restingOpacity?: number;
  restingScale?: number;
  markFocusRange?: number;
  markSize?: number;
  /**
   * The item's own mark, drawn at the row's fixed left edge.
   *
   * ⭐ Called during RENDER, never inside a worklet. Passing a JS function into a worklet is the
   * runtime crash this method records; the worklets here only ever read numbers.
   */
  renderMark?: (item: FocusSlotItem, index: number) => ReactNode;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  onIndexChange?: (index: number) => void;
};

/**
 * A column of items that rolls through a fixed focus slot on a timer. Whatever occupies the slot
 * is promoted — full opacity, full scale, indented to make room for its mark; everything else is
 * a faint ghost.
 *
 * The mechanism is the SLOT, not the list: the focus never moves, the content moves through it.
 */
export function FocusSlotTicker({
  items,
  rowPitch = SLOT_PITCH,
  periodMs = STEP_PERIOD_MS,
  indent = FOCUS_INDENT,
  restingOpacity = RESTING_OPACITY,
  restingScale = RESTING_SCALE,
  markFocusRange = MARK_FOCUS_RANGE,
  markSize = 28,
  renderMark,
  textStyle,
  style,
  onIndexChange,
}: FocusSlotTickerProps) {
  const { slot, index, reducedMotion } = useFocusSlot(items.length, periodMs);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  // A screen reader gets the whole set at once. Chasing a moving row would be worse than useless.
  const spokenLabel = items.map((item) => item.label).join(', ');

  return (
    <View
      style={[styles.viewport, { height: rowPitch * 3 }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={spokenLabel}
    >
      <View style={styles.rows} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {reducedMotion ? (
          <StaticFocusRow
            items={items}
            index={index}
            rowPitch={rowPitch}
            indent={indent}
            markSize={markSize}
            renderMark={renderMark}
            textStyle={textStyle}
          />
        ) : (
          items.map((item, i) => (
            <TickerRow
              key={item.key}
              item={item}
              index={i}
              count={items.length}
              slot={slot}
              rowPitch={rowPitch}
              indent={indent}
              restingOpacity={restingOpacity}
              restingScale={restingScale}
              markFocusRange={markFocusRange}
              markSize={markSize}
              renderMark={renderMark}
              textStyle={textStyle}
            />
          ))
        )}
      </View>
    </View>
  );
}

type TickerRowProps = {
  item: FocusSlotItem;
  index: number;
  count: number;
  slot: SharedValue<number>;
  rowPitch: number;
  indent: number;
  restingOpacity: number;
  restingScale: number;
  markFocusRange: number;
  markSize: number;
  renderMark?: (item: FocusSlotItem, index: number) => ReactNode;
  textStyle?: StyleProp<TextStyle>;
};

function TickerRow({
  item,
  index,
  count,
  slot,
  rowPitch,
  indent,
  restingOpacity,
  restingScale,
  markFocusRange,
  markSize,
  renderMark,
  textStyle,
}: TickerRowProps) {
  // Computed ONCE per frame and shared by the three styles below.
  const distance = useDerivedValue(() => signedSlotDistance(index, slot.value, count));

  /** 1 in the slot, 0 once the row is far enough out for its mark to be gone. */
  const focus = useDerivedValue(() =>
    interpolate(Math.abs(distance.value), [0, markFocusRange], [1, 0], Extrapolation.CLAMP),
  );

  const rowStyle = useAnimatedStyle(() => {
    const away = Math.abs(distance.value);
    return {
      opacity: interpolate(away, [0, 1, 2], [1, restingOpacity, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: distance.value * rowPitch },
        { scale: interpolate(away, [0, 1], [1, restingScale], Extrapolation.CLAMP) },
      ],
    };
  });

  // The label TRANSLATES to clear the mark. Animating the mark's width instead would be a layout
  // pass every frame, which this method forbids outright — and it would reflow the text with it.
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: focus.value * indent }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: 0.6 + 0.4 * focus.value }],
  }));

  return (
    <Animated.View style={[styles.row, { top: rowPitch, height: rowPitch }, rowStyle]}>
      <Animated.View
        style={[styles.mark, { width: markSize, height: markSize }, markStyle]}
        pointerEvents="none"
      >
        {renderMark?.(item, index)}
      </Animated.View>
      <Animated.Text style={[styles.label, textStyle, labelStyle]} numberOfLines={1}>
        {item.label}
      </Animated.Text>
    </Animated.View>
  );
}

type StaticFocusRowProps = {
  items: readonly FocusSlotItem[];
  index: number;
  rowPitch: number;
  indent: number;
  markSize: number;
  renderMark?: (item: FocusSlotItem, index: number) => ReactNode;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Reduce Motion.
 *
 * ⭐ The column is decoration and decoration STOPS — but the five labels only ever exist BECAUSE
 * of the animation, so switching it off entirely would delete the content. The honest compromise
 * is to keep the cadence and drop the travel: one row, in place, crossfading. Nothing slides,
 * nothing scales, and everything the component had to say still gets said.
 */
function StaticFocusRow({
  items,
  index,
  rowPitch,
  indent,
  markSize,
  renderMark,
  textStyle,
}: StaticFocusRowProps) {
  const [shown, setShown] = useState(index);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (shown === index) return;
    fade.value = withSequence(
      withTiming(0, { duration: REDUCED_FADE_MS / 2 }),
      withTiming(1, { duration: REDUCED_FADE_MS / 2 }),
    );
    // Swap at the midpoint, while the label is fully transparent, so the change is never seen.
    const id = setTimeout(() => setShown(index), REDUCED_FADE_MS / 2);
    return () => clearTimeout(id);
  }, [index, shown, fade]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const item = items[shown];
  if (!item) return null;

  return (
    <Animated.View style={[styles.row, { top: rowPitch, height: rowPitch }, fadeStyle]}>
      <View style={[styles.mark, { width: markSize, height: markSize }]} pointerEvents="none">
        {renderMark?.(item, shown)}
      </View>
      <Animated.Text style={[styles.label, textStyle, { transform: [{ translateX: indent }] }]} numberOfLines={1}>
        {item.label}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', justifyContent: 'center' },
  rows: { flex: 1 },
  row: { position: 'absolute', left: 0, right: 0, justifyContent: 'center' },
  mark: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 38, fontWeight: '600' },
});

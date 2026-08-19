import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

export type PageDotsProps = {
  scrollX: SharedValue<number>;
  pageWidth: number;
  count: number;
  activeColor?: string;
  inactiveColor?: string;
  style?: StyleProp<ViewStyle>;
};

type DotProps = Omit<PageDotsProps, 'count' | 'style'> & { index: number };

function Dot({ scrollX, pageWidth, index, activeColor = '#111', inactiveColor = '#c9c9c9' }: DotProps) {
  const style = useAnimatedStyle(() => {
    // 1.4 means "40% of the way to page 2" — the dot travels WITH the finger.
    const progress = scrollX.value / pageWidth;
    const range = [index - 1, index, index + 1];
    return {
      width: interpolate(progress, range, [6, 20, 6], Extrapolation.CLAMP),
      opacity: interpolate(progress, range, [0.5, 1, 0.5], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(progress, range, [inactiveColor, activeColor, inactiveColor]),
    };
  });

  return <Animated.View style={[styles.dot, style]} />;
}

/** The indicator is DERIVED from the live offset, never from a page-change event. */
export function PageDots({ count, style, ...rest }: PageDotsProps) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} {...rest} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
});

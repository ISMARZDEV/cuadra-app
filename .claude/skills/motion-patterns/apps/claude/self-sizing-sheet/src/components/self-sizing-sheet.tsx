import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSelfSizingSheet } from '../motion/use-self-sizing';

export type SelfSizingSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Rows. Adding or removing one resizes the sheet with the same curve as opening. */
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  backdropColor?: string;
};

/**
 * A bottom sheet sized by its content.
 *
 * The children are rendered TWICE: once invisibly to be measured, once inside the clipped
 * animated container. That is the price of animating to a measured height, and it is why the
 * children must be cheap and side-effect free.
 */
export function SelfSizingSheet({
  open,
  onClose,
  children,
  sheetStyle,
  backdropColor = '#000',
}: SelfSizingSheetProps) {
  const { onContentLayout, sheetStyle: animatedHeight, backdropStyle } = useSelfSizingSheet(open);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'box-none'}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, backdropStyle]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      {/* The measuring copy: laid out, never seen, never interactive. */}
      <View style={styles.measure} pointerEvents="none" onLayout={onContentLayout} aria-hidden>
        {children}
      </View>

      <Animated.View
        style={[styles.sheet, sheetStyle, animatedHeight]}
        accessibilityViewIsModal={open}
      >
        {/* overflow:hidden on the parent is what turns the moving edge into the reveal. */}
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#1c1c1e',
  },
  // Off-screen but laid out, so onLayout reports the real content height.
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0, top: -10000 },
  // Pinned to the BOTTOM of the clipped container so the rows do not move as it grows —
  // only the edge moves, and that is what reveals them.
  content: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

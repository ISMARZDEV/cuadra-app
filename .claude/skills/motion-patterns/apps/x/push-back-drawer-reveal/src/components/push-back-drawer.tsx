import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import {
  usePushBackDrawer,
  type PushBackDrawerController,
} from '../motion/use-push-back-drawer';

export type PushBackDrawerViewProps = {
  /** The navigation panel. Mounted beneath the screen and never moved — only faded. */
  panel: ReactNode;
  /** The live screen. Slides aside as one rigid card. */
  children: ReactNode;
  /**
   * Drive the drawer from outside — a header button, a route change, a deep link.
   * Create it with `usePushBackDrawer` in the parent. Omit it and the view makes its own.
   */
  controller?: PushBackDrawerController;
  openFraction?: number;
  side?: 'left' | 'right';
  onOpenChange?: (open: boolean) => void;
};

/**
 * A screen that slides aside to uncover a panel beneath it.
 *
 * ⭐ The panel is BENEATH, not on top, and that inversion is the pattern. The far more common
 * arrangement — a panel sliding over the content behind a scrim — replaces the user's context.
 * This one keeps it: the card stays unscaled and undimmed, so it never becomes a picture of
 * itself, and the sliver left at the edge reads as a door back rather than as decoration.
 */
export function PushBackDrawerView({
  panel,
  children,
  controller,
  openFraction,
  side = 'right',
  onOpenChange,
}: PushBackDrawerViewProps) {
  const { width } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);

  // Commit-point only — one setState per open/close, never per frame.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const ownController = usePushBackDrawer({
    screenWidth: width,
    openFraction,
    side,
    onOpenChange: handleOpenChange,
  });
  const drawer = controller ?? ownController;

  return (
    <View style={styles.root}>
      {/*
        The panel is inert while closed. Opacity 0 still receives touches, so a closed drawer
        would silently swallow taps meant for the screen above it.
      */}
      <Animated.View
        style={[styles.panel, drawer.panelStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        {panel}
      </Animated.View>

      <GestureDetector gesture={drawer.panGesture}>
        <Animated.View style={[styles.card, drawer.cardStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

// ⭐ StyleSheet.absoluteFillObject is not in this stack's types (RN 0.85 + the react-native-css
// augmentation), so the four offsets are written out.
const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: { ...fill },
  card: { ...fill, overflow: 'hidden' },
});

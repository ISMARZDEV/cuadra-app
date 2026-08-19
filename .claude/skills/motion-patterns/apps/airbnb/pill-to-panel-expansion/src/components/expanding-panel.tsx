import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useExpansion, type ExpansionGeometry } from '../motion/use-expansion';

export type ExpandingPanelProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  geometry: ExpansionGeometry;
  /** Shown while collapsed — the pill's label. */
  collapsed: ReactNode;
  /** Shown while expanded — the panel's body. */
  expanded: ReactNode;
  /** The screen behind. It recedes and blurs; it does NOT unmount. */
  backdrop: ReactNode;
  /** Optional blurred layer; wire `blurRadius` from the hook into its animated props. */
  renderBlur?: (blurRadius: ReturnType<typeof useExpansion>['blurRadius']) => ReactNode;
  panelStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A compact control that BECOMES a panel, and returns.
 *
 * The whole point is that it is ONE object throughout: the pill grows into the panel rather than
 * hiding while a separate panel appears. Two objects crossfading is the cheap version, and the eye
 * reads the difference immediately.
 */
export function ExpandingPanel({
  open,
  onOpen,
  onClose,
  geometry,
  collapsed,
  expanded,
  backdrop,
  renderBlur,
  panelStyle,
  accessibilityLabel,
}: ExpandingPanelProps) {
  const { panelStyle: animatedPanel, contentStyle, pillLabelStyle, backdropStyle, blurRadius } =
    useExpansion(open, geometry);

  return (
    <View style={styles.root}>
      {/* The backdrop stays MOUNTED. Unmounting it would lose scroll position and force a
          re-render on close — the opposite of handing the context back. */}
      <Animated.View style={[styles.fill, backdropStyle]} pointerEvents={open ? 'none' : 'auto'}>
        {backdrop}
      </Animated.View>

      {renderBlur?.(blurRadius)}

      {open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      ) : null}

      <Animated.View style={[styles.panel, panelStyle, animatedPanel]}>
        {/* Collapsed and expanded contents are stacked, not swapped: the crossfade windows do not
            overlap, so they never read on top of each other. */}
        <Animated.View style={[styles.layer, pillLabelStyle]} pointerEvents={open ? 'none' : 'auto'}>
          <Pressable
            onPress={onOpen}
            style={styles.fill}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ expanded: open }}
          >
            {collapsed}
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.layer, contentStyle]} pointerEvents={open ? 'auto' : 'none'}>
          {expanded}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 28,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});

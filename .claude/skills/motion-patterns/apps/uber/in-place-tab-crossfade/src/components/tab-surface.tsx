import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useHeaderMorph, useTabSwap } from '../motion/use-tab-swap';

export type TabSurfaceProps = {
  /** Changing this key is what triggers the swap. */
  activeKey: string;
  /** Persistent chrome above the body. Rendered ONCE, never per tab. */
  header: ReactNode;
  /** The body for the active tab. */
  children: ReactNode;
  /** Persistent chrome below the body. */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * One surface, changing content.
 *
 * The header and footer are rendered ONCE and live outside the animated body. That placement is
 * the pattern: it is what makes them able to persist and morph rather than being rebuilt per tab.
 */
export function TabSurface({ activeKey, header, children, footer, style }: TabSurfaceProps) {
  const { bodyStyle } = useTabSwap(activeKey);
  const headerStyle = useHeaderMorph(activeKey);

  return (
    <View style={[styles.root, style]}>
      <Animated.View style={headerStyle}>{header}</Animated.View>

      {/* `key` forces a fresh subtree per tab, so the outgoing body is cut rather than kept
          around at low opacity underneath. */}
      <Animated.View key={activeKey} style={[styles.body, bodyStyle]}>
        {children}
      </Animated.View>

      {footer ? <View>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});

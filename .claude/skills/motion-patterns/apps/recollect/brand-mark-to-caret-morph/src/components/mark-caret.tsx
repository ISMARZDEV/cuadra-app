import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useMarkToCaret } from '../motion/use-mark-to-caret';

export type MarkCaretProps = {
  /** The brand mark at its full size. */
  mark: ReactNode;
  /** Width of the caret in points, at rest. */
  caretWidth?: number;
  /** Height of the caret in points, at rest. */
  caretHeight?: number;
  color?: string;
  onReady?: (api: ReturnType<typeof useMarkToCaret>) => void;
};

/**
 * A brand mark that BECOMES the caret of a text field.
 *
 * ⭐ The point is that identity is spent buying the affordance rather than being replaced by it:
 * the mark does not fade out while a field fades in, it contracts into the one part of the field
 * that says "type here".
 */
export function MarkCaret({
  mark,
  caretWidth = 3,
  caretHeight = 28,
  color = '#ffffff',
}: MarkCaretProps) {
  const api = useMarkToCaret();

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.layer, api.markStyle]}>{mark}</Animated.View>
      <Animated.View
        style={[
          styles.layer,
          { width: caretWidth, height: caretHeight, backgroundColor: color },
          api.caretStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
});

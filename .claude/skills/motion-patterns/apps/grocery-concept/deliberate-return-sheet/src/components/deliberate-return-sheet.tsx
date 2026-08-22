import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDeliberateSheet } from '../motion/use-deliberate-sheet';

type Props = {
  open: boolean;
  onRequestClose: () => void;
  /** Fires once the sheet has fully left — commit point. */
  onClosed?: () => void;
  /** The page the sheet covers. It dims and recedes; it is NOT unmounted. */
  host: ReactNode;
  children: ReactNode;
};

/**
 * ⭐ The host stays MOUNTED and recedes. Swapping it for a screen transition would lose the scroll
 * position, and getting the page back exactly where it was left is the entire argument for the slow
 * return — a page that comes back scrolled elsewhere makes the 420 ms a waste.
 */
export function DeliberateReturnSheet({
  open,
  onRequestClose,
  onClosed,
  host,
  children,
}: Props) {
  const { onSheetLayout, sheetStyle, veilStyle, hostStyle } = useDeliberateSheet(open, {
    onClosed,
  });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.fill, hostStyle]}>{host}</Animated.View>

      {/* Derived from the sheet's own progress — never its own animation. */}
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.veil, veilStyle]}>
        <Pressable style={styles.fill} onPress={onRequestClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        onLayout={onSheetLayout}
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.sheet, sheetStyle]}
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>
    </View>
  );
}

// StyleSheet.absoluteFillObject is not in this stack's types — the four offsets are written out.
const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000' },
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D5D9DD',
    marginBottom: 8,
  },
});

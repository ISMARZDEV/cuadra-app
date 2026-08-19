// components/premium-bottom-sheet.tsx
import { type ReactNode, useCallback } from 'react';
import { StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedStyle,
  useReducedMotion, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { rubberBand } from '../motion/rubber-band';
import { SHEET_ENTER, SHEET_EXIT } from '../motion/springs';

export type PremiumBottomSheetProps = {
  onClose: () => void;
  children: ReactNode;
  /** Fraction of the height that must be dragged to dismiss. */
  dismissRatio?: number;
  /** Velocity (px/s) that dismisses regardless of distance. */
  dismissVelocity?: number;
};

export function PremiumBottomSheet({
  onClose,
  children,
  dismissRatio = 0.25,
  dismissVelocity = 800,
}: PremiumBottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // ⭐ Starts OFF-SCREEN from the first frame: never seen in the wrong place.
  const translateY = useSharedValue(screenH);
  const sheetH = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const entered = useSharedValue(false);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    sheetH.value = h;
    if (entered.value) return;
    entered.value = true;
    translateY.value = reducedMotion ? 0 : withSpring(0, SHEET_ENTER);
  }, [reducedMotion, sheetH, entered, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])            // do not steal the gesture from an inner scroll
    .onStart(() => {
      offsetY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = offsetY.value + e.translationY;
      // Downward, 1:1. Upward, resistance.
      translateY.value = next < 0 ? rubberBand(next, sheetH.value) : next;
    })
    .onEnd((e) => {
      const farEnough = translateY.value > sheetH.value * dismissRatio;
      const fastEnough = e.velocityY > dismissVelocity;

      if (farEnough || fastEnough) {
        // ⭐ The spring INHERITS the finger's velocity: the motion does not cut.
        translateY.value = withSpring(
          sheetH.value,
          { ...SHEET_EXIT, velocity: e.velocityY },
          (finished) => {
            'worklet';
            if (finished) runOnJS(onClose)();
          },
        );
      } else {
        translateY.value = withSpring(0, { ...SHEET_ENTER, velocity: e.velocityY });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ⭐ DERIVED from the panel's position. Never a twin animation.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: sheetH.value === 0
      ? 0
      : interpolate(translateY.value, [0, sheetH.value], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, sheetStyle]} onLayout={handleLayout}>
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 32, backgroundColor: '#fff',
  },
});

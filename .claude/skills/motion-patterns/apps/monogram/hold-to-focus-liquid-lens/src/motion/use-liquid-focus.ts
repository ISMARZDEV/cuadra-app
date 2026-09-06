import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { LENS_TIMING } from './model';

export function useLiquidFocus(listening: boolean, dimmed: boolean) {
  const startupReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(startupReducedMotion);
  const progress = useSharedValue(listening ? 1 : 0);
  const dim = useSharedValue(dimmed ? 1 : 0);

  useEffect(() => {
    let acceptQuery = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      acceptQuery = false;
      setReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (acceptQuery) setReducedMotion(enabled);
    }).catch(() => {});
    return () => {
      acceptQuery = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.value = reducedMotion ? Number(listening) : withTiming(Number(listening), {
      duration: listening ? LENS_TIMING.enterMs : LENS_TIMING.withdrawMs,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
    return () => cancelAnimation(progress);
  }, [listening, progress, reducedMotion]);

  useEffect(() => {
    dim.value = withTiming(Number(dimmed), {
      duration: reducedMotion ? 0 : LENS_TIMING.dimMs,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(dim);
  }, [dimmed, dim, reducedMotion]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion || progress.value <= 0 ? 0 : 1,
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.18 }));
  return { progress, lensStyle, dimStyle, reducedMotion };
}

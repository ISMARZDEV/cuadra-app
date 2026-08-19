import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { HEADER_MORPH_MS, SWAP_EASING, SWAP_MS } from './timing';

/**
 * Fade the body in place on every tab change.
 *
 * ⭐ There is deliberately NO translation here. Sliding the body sideways is the reflex choice and
 * it is what forces every tab to own its own header — because a shared header cannot slide with
 * one body and stay for the other. Fading in place is what buys the persistent chrome.
 */
export function useTabSwap(activeKey: string) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    // The outgoing body is cut, not crossfaded: the incoming starts partway up and rises.
    opacity.value = 0.35;
    opacity.value = withTiming(1, { duration: SWAP_MS, easing: SWAP_EASING });
  }, [activeKey, reducedMotion, opacity]);

  const bodyStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return { bodyStyle };
}

/**
 * The header's own contents (placeholder, secondary action) crossfade faster than the body, so the
 * chrome is settled before the content finishes arriving.
 */
export function useHeaderMorph(activeKey: string) {
  const t = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withTiming(1, { duration: HEADER_MORPH_MS, easing: SWAP_EASING });
  }, [activeKey, reducedMotion, t]);

  return useAnimatedStyle(() => ({ opacity: t.value }));
}

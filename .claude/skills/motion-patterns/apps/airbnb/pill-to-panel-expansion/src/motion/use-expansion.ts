import { useEffect } from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BACKDROP_BLUR, COLLAPSE, EXPAND } from './springs';

export type ExpansionGeometry = {
  /** Height of the collapsed control (the pill). */
  collapsedHeight: number;
  /** Height of the expanded panel. */
  expandedHeight: number;
  /** Horizontal inset of the pill relative to the panel. 0 if they share width. */
  collapsedInset?: number;
};

/**
 * ONE driver — `progress` — for the whole expansion. Everything else derives from it, so the panel,
 * its content and the backdrop can never desynchronise.
 *
 * The two springs are deliberately different: opening is quick and certain, closing is slower
 * because it is handing the user's context back.
 */
export function useExpansion(open: boolean, geometry: ExpansionGeometry) {
  const { collapsedHeight, expandedHeight, collapsedInset = 0 } = geometry;
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.value = open ? 1 : 0;
      return;
    }
    progress.value = withSpring(open ? 1 : 0, open ? EXPAND : COLLAPSE);
  }, [open, reducedMotion, progress]);

  /** The panel itself: one object that grows, never a pill that hides and a panel that appears. */
  const panelStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [collapsedHeight, expandedHeight], Extrapolation.CLAMP),
    marginHorizontal: interpolate(progress.value, [0, 1], [collapsedInset, 0], Extrapolation.CLAMP),
  }));

  /**
   * Panel CONTENT crossfades on a later, tighter window than the panel's own growth — the box
   * arrives first and the content lands inside it, rather than both racing.
   */
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.85], [0, 1], Extrapolation.CLAMP),
  }));

  /** The collapsed label fades out fast, so the two states never read on top of each other. */
  const pillLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25], [1, 0], Extrapolation.CLAMP),
  }));

  /** Blur radius for the backdrop. Feed it to a BlurView's animated props. */
  const blurRadius = useDerivedValue(() =>
    interpolate(progress.value, [0, 1], [0, BACKDROP_BLUR], Extrapolation.CLAMP),
  );

  /**
   * The backdrop also RECEDES slightly. Blur alone reads as a filter; blur plus a small scale-down
   * reads as depth — the feed stepping back to let the panel through.
   */
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.94], Extrapolation.CLAMP) }],
    opacity: interpolate(progress.value, [0, 1], [1, 0.55], Extrapolation.CLAMP),
  }));

  return { progress, panelStyle, contentStyle, pillLabelStyle, backdropStyle, blurRadius };
}

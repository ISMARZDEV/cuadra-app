import { useEffect, useState } from 'react';
import { MIN_VISIBLE_MS } from './timing';

/**
 * The handoff is gated on READINESS, not on a timer.
 *
 * A fixed setTimeout either truncates the animation on a slow device or wastes a second on a fast
 * one. The splash lasts max(minimum, work): whichever finishes last.
 *
 * Pair with expo-splash-screen's preventAutoHideAsync() so the native splash covers the gap before
 * this component paints.
 */
export function useSplashHandoff(appReady: boolean, minVisibleMs = MIN_VISIBLE_MS): boolean {
  const [floorElapsed, setFloorElapsed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFloorElapsed(true), minVisibleMs);
    return () => clearTimeout(id);
  }, [minVisibleMs]);

  return appReady && floorElapsed;
}

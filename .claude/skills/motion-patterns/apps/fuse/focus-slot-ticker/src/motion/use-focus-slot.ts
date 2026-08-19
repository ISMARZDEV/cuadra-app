import { useEffect, useState } from 'react';
import {
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { SLOT_SPRING, STEP_PERIOD_MS } from './timings';

/**
 * Signed distance from a row to the focus slot, wrapped so the list is a ring.
 *
 * Returns 0 for the row IN the slot, -1 for the row above, +1 for the row below, and wraps at
 * +/- count/2 so rows recycle around the back instead of running off. The recycle jump happens at
 * a distance where the row is already fully transparent, which is why it is never seen — and why
 * the component needs at least 4 items for it to stay hidden.
 */
export function signedSlotDistance(index: number, slot: number, count: number): number {
  'worklet';
  const wrapped = ((slot % count) + count) % count;
  const half = count / 2;
  let d = index - wrapped;
  if (d > half) d -= count;
  if (d < -half) d += count;
  return d;
}

export type FocusSlotDriver = {
  /** PRIMARY. Continuous position of the list in item-index space. Everything else derives. */
  slot: SharedValue<number>;
  /** The item currently in focus, JS side — for onIndexChange and accessibility, never per frame. */
  index: number;
  reducedMotion: boolean;
};

/**
 * The single driver for the whole ticker.
 *
 * ⭐ ONE shared value leads and every visual property is derived from it. Animating position,
 * opacity, scale and indent as four parallel animations is how a ticker desynchronises and starts
 * to look cheap.
 *
 * ⭐ The interval fires once per STEP (~1.5 s), not per frame. A JS timer is the right tool for a
 * cadence; it would be the wrong tool for a curve. The rows themselves are static React elements —
 * the text never changes, only the column moves — so nothing crosses the bridge while it animates.
 *
 * `slot` grows without bound by design (0, 1, 2, ...) and the wrap is done in the worklet. A
 * float64 counter at one step per 1.5 s stays exact for longer than any session will last.
 */
export function useFocusSlot(count: number, periodMs: number = STEP_PERIOD_MS): FocusSlotDriver {
  const slot = useSharedValue(0);
  const [step, setStep] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => {
      setStep((previous) => {
        const next = previous + 1;
        // Under Reduce Motion the column does not travel at all; the component renders a single
        // row and crossfades it, so the shared value is only kept in step for consistency.
        slot.value = reducedMotion ? next : withSpring(next, SLOT_SPRING);
        return next;
      });
    }, periodMs);
    return () => clearInterval(id);
  }, [count, periodMs, reducedMotion, slot]);

  return { slot, index: count > 0 ? ((step % count) + count) % count : 0, reducedMotion };
}

import { useLongPressGesture } from 'react-native-gesture-handler';

export type HoldAction = {
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
  enabled?: boolean;
  /** Product choice, not recoverable from the clip. */
  minDurationMs?: number;
};

/** Discrete recorder commits only; no per-frame JS callbacks. */
export function useHoldAction({
  onStart, onFinish, onCancel, enabled = true, minDurationMs = 180,
}: HoldAction) {
  return useLongPressGesture({
    enabled,
    minDuration: minDurationMs,
    maxDistance: 24,
    shouldCancelWhenOutside: true,
    runOnJS: true,
    onActivate: onStart,
    onDeactivate: (event) => {
      if (event.canceled) onCancel();
      else onFinish();
    },
  });
}

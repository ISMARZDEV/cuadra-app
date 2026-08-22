import { useCallback, useEffect, useState } from 'react';
import { type LayoutChangeEvent, useWindowDimensions } from 'react-native';
import {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  CLOSE_EASING,
  CLOSE_MS,
  HOST_SCALE,
  OPEN_EASING,
  OPEN_MS,
  VEIL_OPACITY,
} from './timings';
import { closedOffset } from './sheet-travel';

type Options = {
  /** Fires once the sheet has fully left. Commit point — safe place for navigation or a refetch. */
  onClosed?: () => void;
};

/**
 * A sheet that arrives fast and returns slowly, over a host page that dims and recedes with it.
 *
 * ⭐ ONE DRIVER. `progress` is 0 closed, 1 open; the sheet's offset, the veil's opacity and the
 * host's scale are all `interpolate` of that same value. Animating three shared values in parallel
 * would desynchronise the moment any of the three durations is touched — and here the durations
 * are the whole point, so parallel values would break exactly the thing being demonstrated.
 */
export function useDeliberateSheet(open: boolean, { onClosed }: Options = {}) {
  // Sheet height changes on layout, not per frame — React state is its correct home.
  const [sheetHeight, setSheetHeight] = useState(0);
  // ⭐ Until onLayout has measured, the sheet hides by the whole viewport: with 0 of travel a
  // CLOSED sheet is drawn in its OPEN position for the mount frame. PATTERN.md warned about this
  // case and the code did not handle it — found while porting the pattern into the app.
  const { height: viewportHeight } = useWindowDimensions();
  // ⭐ Se resuelve AQUÍ, en JS, no dentro del worklet: un worklet no puede llamar a una función JS
  // normal (revienta en tiempo de ejecución con "Tried to synchronously call a non-worklet
  // function"). Y tampoco haría falta — esto depende del LAYOUT, no del fotograma, así que
  // recalcularlo 60 veces por segundo sería trabajo tirado. El worklet captura un número.
  const restingOffset = closedOffset(sheetHeight, viewportHeight);
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setSheetHeight((prev) => (prev === h ? prev : h));
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = open ? 1 : 0;
      if (!open && onClosed) onClosed();
      return;
    }
    // ⭐ The config is chosen by DIRECTION, which is what makes the asymmetry structural rather
    // than a number someone can quietly symmetrise later.
    progress.value = open
      ? withTiming(1, { duration: OPEN_MS, easing: OPEN_EASING })
      : withTiming(0, { duration: CLOSE_MS, easing: CLOSE_EASING }, (finished) => {
          // runOnJS only at the COMMIT point, never per frame.
          if (finished && onClosed) runOnJS(onClosed)();
        });
  }, [open, reducedMotion, progress, onClosed]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [restingOffset, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const veilStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, VEIL_OPACITY], Extrapolation.CLAMP),
  }));

  const hostStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, HOST_SCALE], Extrapolation.CLAMP) },
    ],
  }));

  return { onSheetLayout, sheetStyle, veilStyle, hostStyle };
}

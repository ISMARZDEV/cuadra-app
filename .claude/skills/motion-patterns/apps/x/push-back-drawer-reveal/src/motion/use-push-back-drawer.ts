import { useCallback } from 'react';
import {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import {
  CARD_CORNER_RADIUS,
  COMMIT_FRACTION,
  COMMIT_VELOCITY,
  DEFAULT_OPEN_FRACTION,
  DRAWER_SPRING,
} from './springs';

export type PushBackDrawerOptions = {
  /** Width of the screen the card travels across, in points. */
  screenWidth: number;
  /** How far the card slides, as a fraction of `screenWidth`. Measured default: 0.78. */
  openFraction?: number;
  /** Which way the card is pushed. The panel is revealed on the opposite side. */
  side?: 'left' | 'right';
  /** Called at the COMMIT point only — never per frame. */
  onOpenChange?: (open: boolean) => void;
};

export type PushBackDrawerController = {
  /** THE driver, in points of translation. Everything else derives from it. */
  translate: SharedValue<number>;
  /**
   * 0 at rest, 1 fully open. Exposed so the PARENT can derive its own motion from the drawer —
   * a header icon that morphs, a status bar tint, a backdrop. Without this the component would
   * own a value nobody else can reach, which is the mistake `SnapCarousel` made.
   */
  progress: SharedValue<number>;
  cardStyle: ReturnType<typeof useAnimatedStyle>;
  panelStyle: ReturnType<typeof useAnimatedStyle>;
  /** Pan the card directly. Attach to the card, or to an edge strip. */
  panGesture: ReturnType<typeof Gesture.Pan>;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

/**
 * ONE driver — `translate`, in points — for the whole interaction.
 *
 * ⭐ The panel's opacity is DERIVED from it rather than animated alongside it. That is not a
 * stylistic preference: it is what the reference does. Panel opacity there tracks the card's
 * position curve to within 2% at every sampled frame, which is the signature of one value feeding
 * both. Two parallel animations would drift apart the moment a finger interrupts them.
 *
 * ⭐ The card does NOT scale and does NOT dim. Both were checked against the reference and both
 * are absent: glyph sizes are identical throughout, and luminance tracked WITH the translation is
 * flat. Adding either would be inventing motion the reference does not have.
 */
export function usePushBackDrawer(options: PushBackDrawerOptions): PushBackDrawerController {
  const {
    screenWidth,
    openFraction = DEFAULT_OPEN_FRACTION,
    side = 'right',
    onOpenChange,
  } = options;

  const distance = screenWidth * openFraction;
  const direction = side === 'right' ? 1 : -1;
  const openTo = distance * direction;

  const translate = useSharedValue(0);
  const startX = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  /** Derived, never assigned from inside a style worklet. */
  const progress = useDerivedValue(() =>
    interpolate(Math.abs(translate.value), [0, distance], [0, 1], Extrapolation.CLAMP),
  );

  const commit = useCallback(
    (isOpen: boolean) => {
      onOpenChange?.(isOpen);
    },
    [onOpenChange],
  );

  /**
   * Callable from both threads: the gesture ends on the UI thread, `open()`/`close()` are called
   * from JS. `commit` only ever reaches JS through `runOnJS`, at the settle — never per frame.
   */
  const springTo = useCallback(
    (to: number, velocity: number) => {
      'worklet';
      const isOpen = to !== 0;
      if (reducedMotion) {
        translate.value = to;
        runOnJS(commit)(isOpen);
        return;
      }
      translate.value = withSpring(to, { ...DRAWER_SPRING, velocity }, (finished) => {
        'worklet';
        if (finished) runOnJS(commit)(isOpen);
      });
    },
    [commit, reducedMotion, translate],
  );

  const open = useCallback(() => springTo(openTo, 0), [openTo, springTo]);
  const close = useCallback(() => springTo(0, 0), [springTo]);
  const toggle = useCallback(() => {
    springTo(Math.abs(translate.value) > distance / 2 ? 0 : openTo, 0);
  }, [distance, openTo, springTo, translate]);

  /**
   * ⭐ The gesture is NOT optional, and the reference does not witness it: the clip only ever
   * shows a tap. It is here because a drawer the finger cannot drag is broken however good the
   * tap looks — SKILL.md §4. The physics below is therefore OURS, and PATTERN.md says so.
   *
   * ⭐ Reduce Motion does not disable this. Finger-driven movement is not an animation; only its
   * settle is, and `springTo` above is what honours the setting.
   */
  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translate.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      // Clamp to the corridor. No rubber-band: the reference has hard stops at both ends, and a
      // drawer that stretches past its open position invites a second, meaningless gesture.
      translate.value =
        direction === 1
          ? Math.min(Math.max(next, 0), openTo)
          : Math.max(Math.min(next, 0), openTo);
    })
    .onEnd((e) => {
      const travelled = Math.abs(translate.value) / distance;
      const flicked = e.velocityX * direction;
      const shouldOpen =
        flicked > COMMIT_VELOCITY
          ? true
          : flicked < -COMMIT_VELOCITY
            ? false
            : travelled > COMMIT_FRACTION;
      // ⭐ The finger's velocity is handed to the spring. Without this the motion visibly cuts on
      // release, which is the single clearest tell between premium and merely correct.
      springTo(shouldOpen ? openTo : 0, e.velocityX);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
    // Constant, never animated — at rest the screen's own corner radius hides it entirely.
    borderRadius: CARD_CORNER_RADIUS,
  }));

  /**
   * The panel is STATIC — it never translates. The reference is explicit about this: its items sit
   * at the same x in every frame. Only opacity moves, and it moves on the card's driver.
   */
  const panelStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return { translate, progress, cardStyle, panelStyle, panGesture, open, close, toggle };
}

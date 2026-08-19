import { Easing } from 'react-native-reanimated';

/**
 * `.easeInOut(duration: 0.7)` — NOT a spring.
 *
 * A splash is a statement, and the symmetric acceleration reads as composed. A spring would make
 * the brand mark look jittery. Unlike withSpring, this `duration` is literal.
 */
export const SETTLE_MS = 700;
export const SETTLE_EASING = Easing.bezier(0.42, 0, 0.58, 1);

/** `stagger: pronounced` -> 90 ms between revealed elements. */
export const REVEAL_STAGGER_MS = 90;

/** The floor the splash is held for, so the logo settle is never truncated. */
export const MIN_VISIBLE_MS = 900;

import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * `.spring(response: 0.45, dampingFraction: 0.5)` -> w0 = 13.96
 * Same stiffness as a premium sheet entry; only the damping changes. Bounciness is one number.
 * `mass` is explicit: Reanimated 4 defaults to 4, not 1.
 */
export const CARD_POP: WithSpringConfig = { mass: 1, stiffness: 195, damping: 14 };

/** Gap between cards, from the shot's `stagger_delay: 0.09`. */
export const STAGGER_MS = 90;

/** Counters are NOT springs — a number that overshoots and comes back reads as a bug. */
export const COUNT_DURATION_MS = 600;

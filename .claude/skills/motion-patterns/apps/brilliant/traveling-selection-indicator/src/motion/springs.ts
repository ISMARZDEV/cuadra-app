import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * `.spring(response: 0.45, dampingFraction: 0.72)` -> w0 = 13.96
 *
 * Identical to the premium bottom sheet's entry — the same "confident, barely bouncy" signature.
 * zeta 0.72 matters here: an indicator that visibly bounces past its target looks like it MISSED.
 */
export const INDICATOR: WithSpringConfig = { mass: 1, stiffness: 195, damping: 20.1 };

/** Peak of the hop arc, in points. 0 turns the jump back into a slide. */
export const HOP_HEIGHT = 14;

import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * MEASURED off the reference, not reported by any API.
 *
 * The expansion settles in ~417ms with no visible overshoot: a panel that bounces past its size
 * reads as unstable, because the user is about to type into it.
 * `.spring(response: 0.42, dampingFraction: 0.86)` -> w0 = 14.96
 */
export const EXPAND: WithSpringConfig = { mass: 1, stiffness: 224, damping: 25.7 };

/**
 * The collapse takes ~633ms — 1.5x the expansion.
 *
 * ⭐ This INVERTS the bottom-sheet asymmetry (where the exit was drier than the entry), and it is
 * deliberate: the sheet's exit was a dismissal, so obeying fast was right. Here the panel is
 * putting the user's context BACK, and the eye needs time to re-find the feed it left. Softer and
 * slower on the way out.
 */
export const COLLAPSE: WithSpringConfig = { mass: 1, stiffness: 98, damping: 19.8 };

/** Gap between the panel's own move and its content fading. */
export const CONTENT_STAGGER_MS = 50;

/** Maximum blur applied to the backdrop, in points. */
export const BACKDROP_BLUR = 18;

import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * MEASURED off the reference at 60fps.
 *
 * ⭐ THE HEADLINE FINDING IS A NEGATIVE ONE. The MCP describes "an array of image cards scrolls
 * through the screen background". It does not scroll. Phase correlation over a 260x600 card
 * column at lags of 100 / 200 / 500 ms returns 0-2 px of vertical displacement while RMSE grows
 * 0.059 -> 0.122: the content CHANGES without translating. Building this as a scroll would be
 * implementing a description instead of the motion.
 */
export const BATCH_INTERVAL_MS = 2400;

/**
 * Quadrant luminance shows the four regions of the grid changing 100-150 ms apart, not together.
 * The library's `stagger: balanced` prior is 70 ms; this sits above it because the elements are
 * large and simultaneous replacement would read as a cut.
 */
export const QUADRANT_STAGGER_MS = 120;

/** How long one card takes to trade places with its replacement. */
export const CARD_SWAP: WithSpringConfig = { mass: 1, stiffness: 220, damping: 26 };

/** Scale a card enters from. Small enough to read as arriving, not as a page load. */
export const CARD_ENTER_SCALE = 0.88;

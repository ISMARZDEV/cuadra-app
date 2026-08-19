import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * MEASURED, not labelled: the sheet's header travelled 204 -> 148 -> 116 -> 108 -> 107 -> 106 -> 106
 * across 50ms frames — a ~220ms monotonic settle that NEVER passes its resting position.
 *
 * ⭐ No overshoot means this is critically damped (ζ ≈ 1.0), not the ζ≈0.72 "premium" signature
 * used elsewhere in this library. A container whose height is being read as layout must not
 * bounce: overshooting would make every row inside it visibly jump past its final place.
 *
 * ζ = 1.0, ω₀ ≈ 19 rad/s  ->  stiffness = ω₀² = 361, damping = 2ζω₀ = 38
 * `mass` is explicit: Reanimated 4 defaults to 4, not 1.
 */
export const RESIZE: WithSpringConfig = { mass: 1, stiffness: 361, damping: 38 };

/**
 * ⭐ The SAME config is used for opening, for closing, and for every content-driven regrowth.
 * That is the point of the pattern: height is a function of content, so every height change is
 * the same event and must feel identical. Giving the open a different curve from the regrow is
 * what makes a sheet feel like it has two personalities.
 */
export const BACKDROP_DIM = 0.55;

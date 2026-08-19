import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * MEASURED off 45 frames at 60fps, not reported by any API.
 *
 * The white glyph's bounding box goes 70x86 -> 5x48 between 292ms and 470ms. Fitting the width
 * progress:  zeta = 1.00, w0 = 46.5  (rms 0.0151), beating iOS-standard/140ms (0.0236) and
 * easeOut/100ms (0.0340). No overshoot at any frame.
 *
 *   response  = 2*pi/46.5 = 135ms
 *   stiffness = w0^2      = 2162
 *   damping   = 2*z*w0    = 93
 *
 * ⭐ `mass` is explicit — Reanimated 4 defaults to 4.
 *
 * ⭐ zeta 1.00 is the highest in the library, and it is not timidity. A caret is the one element a
 * user expects to be perfectly still: overshoot on a text cursor reads as a glitch, not as
 * delight. Compare the library's 0.72 for things that ARRIVE and 0.84 for a drawer being set
 * aside — this sits above both because it is becoming a cursor.
 *
 * ⭐ The MCP reported `.spring(response: 0.45, dampingFraction: 0.72)` for this shot. That is its
 * label-derived default (timing:medium + springiness:subtle) and it is 3.3x slower than what the
 * footage actually does. The video is the judge.
 */
export const MARK_TO_CARET: WithSpringConfig = { mass: 1, stiffness: 2162, damping: 93 };

/**
 * The contraction is NON-UNIFORM, and that is the whole shape of the effect: the mark collapses
 * horizontally almost completely while keeping most of its height. Measured end/start ratios.
 */
export const CARET_SCALE_X = 5 / 70;  // 0.071
export const CARET_SCALE_Y = 48 / 86; // 0.558

/**
 * Caret blink half-period, in ms. A blinking cursor is PERPETUAL motion, so it is driven by a
 * linear clock and thresholded — never a spring, never an easing. An eased blink reads as a
 * pulsing glow instead of a cursor.
 */
export const CARET_BLINK_MS = 530;

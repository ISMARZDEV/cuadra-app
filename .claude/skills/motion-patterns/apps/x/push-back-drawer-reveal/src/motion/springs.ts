import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * MEASURED off the reference clip, not reported by any API and not labelled by eye.
 *
 * 30 frames at 60fps across the open and 43 across the close were read off gridded kymographs,
 * then fitted numerically. A spring beat every easing family tried, in BOTH directions:
 *
 *   open   z=0.84  w0=25.5   rms 0.0081   (best easing: easeOut/150ms, rms 0.0124)
 *   close  z=0.84  w0=25.0   rms 0.0047   (best easing: iOS-standard/205ms, rms 0.0084)
 *
 * The two directions land on the same zeta and the same w0 within measurement error, so ONE config
 * ships for both. Taking w0 = 25.3 (response 248ms) with mass 1:
 *
 *   stiffness = w0^2      = 640
 *   damping   = 2*z*w0    = 2 * 0.84 * 25.3 = 42.5
 *
 * ⭐ `mass` is explicit. Reanimated 4 defaults to mass 4, so omitting it here would quietly make
 * the drawer four times heavier than what was measured.
 */
export const DRAWER_SPRING: WithSpringConfig = { mass: 1, stiffness: 640, damping: 42.5 };

/**
 * ⭐ zeta 0.84 is DELIBERATELY above the library's 0.72 "premium arrival" signature.
 *
 * 0.72 is what things that ARRIVE use — a sheet, a snapping card, a travelling indicator. A
 * navigation drawer is not arriving, it is being SET ASIDE and must stay put once it lands: at
 * 0.72 this travel (78% of the screen width) would overshoot by ~24px, and a navigation surface
 * that springs past its stop reads as loose rather than as delightful. At 0.84 the overshoot is
 * ~4px, which is below what the eye resolves — and matches the reference, where 31 settled frames
 * show no reversal at all.
 */
export const DRAWER_DAMPING_RATIO = 0.84;

/**
 * How far the screen slides, as a fraction of its own width. Measured: 498px of a 640px screen.
 * The leftover 22% sliver is not decoration — it is the affordance for getting back.
 */
export const DEFAULT_OPEN_FRACTION = 0.78;

/**
 * Corner radius on the card's leading edge, in points. Measured ~8pt.
 *
 * It is CONSTANT, never animated: at rest the card is flush with the screen, whose own (much
 * larger) corner radius hides it completely. Animating a radius per frame would buy an effect
 * nobody can see and cost a paint property on every frame.
 */
export const CARD_CORNER_RADIUS = 8;

/**
 * Fraction of the remaining travel past which a release commits instead of springing back.
 * Not witnessed by the clip — the reference only ever shows a tap. See PATTERN.md.
 */
export const COMMIT_FRACTION = 0.5;

/** Velocity (pt/s) that commits a flick regardless of how far the finger actually travelled. */
export const COMMIT_VELOCITY = 500;

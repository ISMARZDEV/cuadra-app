import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * Every number here was MEASURED off the reference clip at 60 fps, not labelled.
 *
 * Calibration: the frame is 2000x2000 and the phone screen inside it is 766 px wide. Against a
 * 393 pt logical width that is 1.95 px/pt, which is how the pixel readings below become points.
 *
 * ⭐ The reference's own metadata disagreed with itself and with the video, which is exactly the
 * trap this method warns about. Three sources, three answers:
 *
 *   - the `animation` field ......... .spring(response: 0.45, dampingFraction: 0.72)
 *   - the generated Swift file ...... .spring(response: 0.58, dampingFraction: 0.68), 2100 ms apart
 *   - the VIDEO, measured ........... response 0.34, zeta 0.82, 1540 ms apart
 *
 * The video is the judge. The other two are interpretations.
 */

/**
 * Distance between adjacent rows, and therefore the travel of one step.
 * Measured between glyph centres on a settled frame: 136 px -> 70 pt. (The Swift file says 52.)
 */
export const SLOT_PITCH = 70;

/**
 * One step every 1540 ms. Measured as the spacing of the five steps in the whole-clip trajectory
 * (1133 / 2717 / 4250 / 5800 / 7283 ms) — remarkably regular, so this is a metronome, not a easing.
 *
 * ⭐ The travel itself is ~300 ms, so ~1240 ms of this is DWELL. Reading time is the point: the
 * whole component exists to let someone read a word before it is replaced.
 */
export const STEP_PERIOD_MS = 1540;

/**
 * How far the label slides right when its row takes focus, making room for the mark that fades in
 * at the row's fixed left edge. Measured on the SAME word in both states: 720 px -> 820 px = 51 pt.
 */
export const FOCUS_INDENT = 50;

/**
 * What an out-of-focus row is worth. Measured by comparing ink over a tight box around the same
 * word in both states: the neighbours carry 8.7% of the focused row's ink. Rows above and below
 * measured IDENTICALLY (7 vs 7 against 80), so the fade is symmetric with no directional bias.
 *
 * ⭐ This looked like it contradicted the reference implementation, which fades to 0.28 — until you
 * notice that file applies opacity TWICE (row 0.28 x label colour 0.28 = 0.078). It agrees.
 */
export const RESTING_OPACITY = 0.09;

/** Measured from cap height (44 px vs 53 px) and confirmed by word width (109 px vs 130 px). */
export const RESTING_SCALE = 0.84;

/**
 * MEASURED: travel 136 px, onset -> settle ~300 ms, overshoot 1-2 px (~1.2% of travel).
 *
 *   zeta = -ln(M) / sqrt(pi^2 + ln^2(M)) with M = 0.012  ->  0.82
 *   w0   = (pi / t_peak) / sqrt(1 - zeta^2)              ->  18.5 rad/s
 *   response = 2*pi / w0                                  ->  0.34 s
 *
 *   stiffness = mass * w0^2      = 1 * 18.5^2   = 341
 *   damping   = 2 * zeta * mass * w0 = 2*0.82*18.5 = 30.4
 *
 * ⭐ mass is EXPLICIT. Reanimated 4 defaults to mass 4 (verified in springConfigs.d.ts), so
 * omitting it silently quadruples the inertia and none of the arithmetic above holds.
 *
 * ⭐ Honest note on precision: the overshoot is 1-2 px on a 115-136 px travel — at the very limit
 * of what the strip can resolve. zeta is therefore bracketed 0.79-0.82 rather than known to three
 * decimals. It is reported as 0.82 because the reference independently labels the springiness
 * "subtle", which this method's table reads as zeta 0.85. Two routes, one neighbourhood.
 * Do NOT exaggerate the bounce when tuning: a word being read must not wobble.
 */
export const SLOT_SPRING: WithSpringConfig = { mass: 1, stiffness: 341, damping: 30.4 };

/**
 * How close to the focus slot a row must be before its mark appears and its label indents.
 *
 * ⭐ INFERRED, not measured — the one number here that is not. The mark was already faintly
 * visible ~12% into the travel, so it clearly ramps across most of the approach rather than
 * snapping on at the end; the exact curve could not be read because the mark is moving vertically
 * while it fades, so no fixed sampling box tracks it. Treat this as a tuning knob, not a fact.
 */
export const MARK_FOCUS_RANGE = 0.75;

/** Reduce Motion: how long the label crossfades when it changes with no travel at all. */
export const REDUCED_FADE_MS = 220;

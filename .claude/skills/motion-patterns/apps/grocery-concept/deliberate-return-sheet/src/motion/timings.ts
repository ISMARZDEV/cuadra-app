import { Easing } from 'react-native-reanimated';

/**
 * MEASURED off vertical kymographs at 60 fps (`frames/kymoV_w2.png`, `frames/kymoV_w3.png`).
 *
 * ⭐ NOT a spring. Neither staircase reverses, in either direction — there is no overshoot to
 * measure, so `measure-spring.py` has nothing to chew on and the honest translation is
 * `withTiming` + a bezier. This is the first sheet in the library that does not spring: the other
 * two (ζ0.72 and ζ1.0) are objects that ARRIVE, and this one is a surface carrying a list to read.
 *
 * ⭐ The window bounds printed by `peek.sh` are NOT these numbers. They carry padding — read as
 * durations they gave 383 ms / 767 ms, both wrong by a wide margin. Measure, never read the label.
 */
export const OPEN_MS = 150;
export const CLOSE_MS = 420;

/**
 * ⭐ The asymmetry is the pattern. 2.8x, and it is derived, not copied:
 *
 * Opening, the decision is already made — the user tapped BECAUSE they want to choose a store, so
 * the sheet has to be there before the thought finishes. Decelerating into place (ease-out) is what
 * makes 150 ms read as "arrived" rather than "snapped".
 *
 * Closing, the user is handed back a page they must re-find their place in. Accelerating away
 * (ease-in) leaves the page uncovered for longer at the start of the gesture, which is exactly the
 * part the eye needs. Rushing this reads as the app taking the page away, not giving it back.
 *
 * Compare the three answers the library already had: a dismissal that should OBEY exits faster
 * (`premium-bottom-sheet-spring`), a context handover exits 1.5x slower (`pill-to-panel-expansion`),
 * a drawer that is one object exits on the same spring (`push-back-drawer-reveal`). Never copy an
 * asymmetry — derive it from what the exit MEANS.
 */
export const OPEN_EASING = Easing.out(Easing.cubic);
export const CLOSE_EASING = Easing.in(Easing.cubic);

/** How dark the host page goes while the sheet is up. Derived from the sheet, never animated on its own. */
export const VEIL_OPACITY = 0.45;

/**
 * How far the host page recedes. Small on purpose: enough to read as "behind", not so much that the
 * page looks like it left. Scale is a transform, so it stays on the cheap path.
 */
export const HOST_SCALE = 0.94;

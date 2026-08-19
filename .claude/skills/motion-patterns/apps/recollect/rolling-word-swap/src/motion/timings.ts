/**
 * MEASURED: the trailing word changes over ~250 ms (8583 -> 8833 ms in the reference), travelling
 * vertically through a ~54 px band while the outgoing word fades.
 *
 * ⭐ The MCP calls this "typewriter-style text" and lists `typing` among the motion behaviors.
 * It is not: there is no character-by-character reveal at any frame. The whole word rolls and
 * crossfades. Implementing the description would have produced a different — and wrong — effect.
 */
export const WORD_ROLL_MS = 250;

/** How long each word is held before the next one rolls in. */
export const WORD_HOLD_MS = 2150;

/**
 * ⭐ A word cycling forever is PERPETUAL motion, and the library's rule is that perpetual motion
 * is LINEAR or it seams once per lap. But each individual roll is a TRANSIENT that arrives, so it
 * gets an ease-out. The loop is the timer; the roll is the animation. Keeping those two separate
 * is what stops this reading as a slot machine.
 */
export const ROLL_DISTANCE = 28;

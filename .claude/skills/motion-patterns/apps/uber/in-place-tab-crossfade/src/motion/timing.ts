import { Easing } from 'react-native-reanimated';

/**
 * MEASURED: the incoming body went 0.35 → 0.6 → 0.75 → 0.85 → 0.95 → 1.0 across 50ms frames,
 * settling ~280ms after the swap. Horizontal travel: ZERO.
 *
 * ⭐ Opacity only, and NOT a spring. A body fading in is a value the eye reads as "how ready is
 * this", and values do not overshoot — the same rule that keeps counters on withTiming.
 */
export const SWAP_MS = 280;
export const SWAP_EASING = Easing.out(Easing.cubic);

/**
 * The header does not swap — it morphs. Its label crossfade is faster than the body so the chrome
 * has already settled by the time the body finishes arriving.
 */
export const HEADER_MORPH_MS = 180;

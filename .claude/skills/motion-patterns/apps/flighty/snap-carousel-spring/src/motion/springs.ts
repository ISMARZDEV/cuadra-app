import type { WithSpringConfig } from 'react-native-reanimated';

/**
 * `.spring(response: 0.25, dampingFraction: 0.72)` -> w0 = 25.13
 *
 * The fastest spring in the library. Note it shares zeta 0.72 with the bottom sheet's entry
 * (k195) — stiffness is the TEMPO, damping is the CHARACTER.
 * `mass` is explicit: at this stiffness, inheriting Reanimated 4's default mass of 4 would ruin it.
 */
export const SNAP_BACK: WithSpringConfig = { mass: 1, stiffness: 632, damping: 36.2 };

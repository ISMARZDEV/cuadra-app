// motion/springs.ts
import type { WithSpringConfig } from 'react-native-reanimated';
// ⭐ The exported type is `WithSpringConfig`. `SpringConfig` is internal and NOT exported.

/** `.spring(response: 0.45, dampingFraction: 0.72)` → ω₀ = 13.96 */
export const SHEET_ENTER: WithSpringConfig = { mass: 1, stiffness: 195, damping: 20.1 };
/** `.spring(response: 0.35, dampingFraction: 0.85)` → ω₀ = 17.95 */
export const SHEET_EXIT: WithSpringConfig = { mass: 1, stiffness: 322, damping: 30.5 };
/** `.spring(response: 0.55, dampingFraction: 0.58)` → ω₀ = 11.42 */
export const CONTENT_POP: WithSpringConfig = { mass: 1, stiffness: 131, damping: 13.3 };

export const STAGGER_MS = 90;

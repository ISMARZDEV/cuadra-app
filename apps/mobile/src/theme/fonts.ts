// Font-family names as registered by `useFonts()` in app/_layout.tsx — a typo in a raw string
// silently falls back to the system font with no error, so every text reference uses these
// constants instead of retyping the full font name by hand.
// Cuadra's body font is Kantumruy Pro (entire app); weights 400/500/600/700 are loaded.
export const KANTUMRUY_REGULAR = "KantumruyPro_400Regular";
export const KANTUMRUY_MEDIUM = "KantumruyPro_500Medium";
export const KANTUMRUY_SEMIBOLD = "KantumruyPro_600SemiBold";
export const KANTUMRUY_BOLD = "KantumruyPro_700Bold";

// Kept for backward compatibility until all call sites migrate.
export const AKSHAR_MEDIUM = KANTUMRUY_MEDIUM;
export const AKSHAR_SEMIBOLD = KANTUMRUY_SEMIBOLD;

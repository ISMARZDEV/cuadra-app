/** @type {import('tailwindcss').Config} */
// Cuadra design tokens — warm green (cuadra-design-system skill).
// Semantic colors resolve from CSS variables set at runtime by the ThemeProvider
// (src/lib/theme), which switches light/dark following the system color scheme.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Theme-aware (values injected by ThemeProvider via vars())
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        // Metric/money accents (constant across themes)
        income: "#3B82F6",
        expense: "#F97316",
        savings: "#A855F7",
        balance: "#22C55E",
        danger: "#EF4444",
        success: "#22C55E",
      },
      fontFamily: {
        // Kantumruy Pro — the entire app's typeface. Each weight is a separate TTF, so NativeWind
        // gets one utility per face. Use `font-sans` for body text and `font-sans-semibold` for
        // emphasis; the numeric fontWeight utilities are NOT used because RN would not resolve the
        // correct file in this multi-file setup.
        sans: ["KantumruyPro_400Regular"],
        "sans-medium": ["KantumruyPro_500Medium"],
        "sans-semibold": ["KantumruyPro_600SemiBold"],
        "sans-bold": ["KantumruyPro_700Bold"],
      },
    },
  },
};

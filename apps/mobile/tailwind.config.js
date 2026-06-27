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
    },
  },
};

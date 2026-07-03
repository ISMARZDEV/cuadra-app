// Paleta JS — SOLO para contextos sin className (react-native-svg charts, StatusBar,
// navigation theme). El estilado de UI va con NativeWind (tokens en tailwind.config.js).
// Mantener en sync con los valores del design-system (cuadra-design-system skill).
export const palette = {
  primary: "#16A34A", // brand green
  accent: "#7EB427", // lime CTA
  // metric/money accents
  income: "#3B82F6",
  expense: "#F97316",
  savings: "#A855F7",
  balance: "#22C55E",
  danger: "#EF4444",
  success: "#22C55E",
} as const;

export const theme = {
  light: {
    bg: "#F2F7F1",
    bgGradient: ["#FFFFFF", "#FFFFFF"], // vertical top → bottom (white → soft green)
    surface: "#FFFFFF",
    text: "#111827",
    muted: "#6B7280",
    border: "#DBEAD9",
  },
  dark: {
    bg: "#0B1410",
    bgGradient: ["#000000", "#041010"], // vertical top → bottom (deep teal → near-black)
    surface: "#12201A",
    text: "#F7FAF7",
    muted: "#9CA3AF",
    border: "#1E3A2A",
  },
} as const;

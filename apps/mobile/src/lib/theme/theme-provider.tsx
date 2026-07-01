import { vars, useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppBackground } from "@/components/ui/app-background";

// Single source of truth for theme token VALUES (cuadra-design-system skill).
// Applied as CSS variables at the root; tailwind.config maps them to color utilities
// (bg-bg, text-primary, …). Switches with the system color scheme via useColorScheme().
const themes = {
  light: vars({
    "--color-bg": "242 247 241", // #F2F7F1
    "--color-surface": "255 255 255", // white
    "--color-primary": "22 163 74", // #16A34A
    "--color-accent": "126 180 39", // #7EB427
    "--color-text": "17 24 39", // #111827
    "--color-muted": "107 114 128", // #6B7280
    "--color-border": "219 234 217", // faint lime
  }),
  dark: vars({
    "--color-bg": "11 20 16", // #0B1410
    "--color-surface": "18 32 26", // #12201A
    "--color-primary": "22 163 74", // #16A34A
    "--color-accent": "126 180 39", // #7EB427
    "--color-text": "247 250 247", // #F7FAF7
    "--color-muted": "156 163 175", // #9CA3AF
    "--color-border": "30 58 42", // #1E3A2A
  }),
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();
  return (
    <View style={themes[colorScheme === "dark" ? "dark" : "light"]} className="flex-1">
      <AppBackground />
      {children}
    </View>
  );
}

import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { theme } from "@/theme";

// Single icon entry point (cuadra-mobile skill: lucide is the ONLY icon set).
// Pass a lucide icon via `as`. Color defaults to the theme `text` token and follows
// the system scheme; override with `color` (e.g. palette.primary) when needed.
type IconProps = {
  as: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ as: LucideCmp, size = 24, color, strokeWidth = 2 }: IconProps) {
  const { colorScheme } = useColorScheme();
  const fallback = theme[colorScheme === "dark" ? "dark" : "light"].text;
  return <LucideCmp size={size} color={color ?? fallback} strokeWidth={strokeWidth} />;
}

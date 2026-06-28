import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { palette } from "@/theme";

// Round liquid-glass symbol button (Figma "Button - Liquid Glass - Symbol").
// `glass` = native iOS 26 liquid glass (expo-glass-effect, falls back to a plain rounded view
// on unsupported OS); `solid` = filled brand green (the send button).
type GlassButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  variant?: "glass" | "solid";
};

export function GlassButton({
  icon,
  label,
  onPress,
  size = 44,
  iconSize = 22,
  variant = "glass",
}: GlassButtonProps) {
  const solid = variant === "solid";
  const shape = { width: size, height: size, borderRadius: size / 2 } as const;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={shape}>
      {solid ? (
        // Solid send button: lime #c2fb7e fill + dark teal icon (Figma "Button - Liquid Glass - Symbol" send).
        <View style={{ ...shape, backgroundColor: "#c2fb7e", alignItems: "center", justifyContent: "center" }}>
          <Icon as={icon} size={iconSize} color="#034842" />
        </View>
      ) : (
        <GlassSurface style={{ ...shape, alignItems: "center", justifyContent: "center" }}>
          <Icon as={icon} size={iconSize} color={palette.primary} />
        </GlassSurface>
      )}
    </Pressable>
  );
}

import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import { t } from "@/i18n";

import type { QuickActionsProps } from "../interfaces";

// The four static suggestion prompts shown when the dock is opened manually (Figma "quick actions").
// They are localized prompts the user can tap to send straight to the chat. Order matches the design
// (2×2). Dynamic/contextual suggestions are a later phase — these stay in i18n for now.
const QUICK_ACTION_KEYS = [
  "chat.quickActions.spentThisMonth",
  "chat.quickActions.registerIncome",
  "chat.quickActions.shoppingList",
  "chat.quickActions.availableMoney",
] as const;

// Suggestion chips. Theme-inverted like the glass buttons: dark → lime pill + dark-green text;
// light → dark-green pill + lime text, so the chip never washes out against the background.
export function QuickActions({ onSelect }: QuickActionsProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const pillBg = isDark ? "#C2FB7E" : "#034842";
  const pillText = isDark ? "#04392B" : "#C2FB7E";

  return (
    <View className="flex-row flex-wrap justify-center gap-3 px-3 py-2">
      {QUICK_ACTION_KEYS.map((key) => {
        const label = t(key);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(label)}
            style={{ backgroundColor: pillBg, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12 }}
          >
            <Text style={{ color: pillText, fontSize: 15, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

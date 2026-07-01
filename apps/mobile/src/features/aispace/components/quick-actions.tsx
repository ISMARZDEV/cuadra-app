import { Pressable, Text, View } from "react-native";

import { t, useLang } from "@/i18n";

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

// Suggestion chips — SAME fixed palette in BOTH themes (not theme-inverted like the glass
// buttons): the pale-lime/dark-green pair from the HITL dock's "secondary" pills, light values
// (dock-interaction-view's pillColors, e.g. Cancel / "sin categoría").
export function QuickActions({ onSelect }: QuickActionsProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const pillBg = "#D9F5C2";
  const pillText = "#034842";

  return (
    // Two per row (Img 25): each pill ~half width, centered, smaller text that shrinks to fit.
    <View className="flex-row flex-wrap justify-between gap-y-3 px-3 py-2">
      {QUICK_ACTION_KEYS.map((key) => {
        const label = t(key);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(label)}
            style={{
              width: "48%",
              backgroundColor: pillBg,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: pillText, fontSize: 13, fontWeight: "700", textAlign: "center" }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

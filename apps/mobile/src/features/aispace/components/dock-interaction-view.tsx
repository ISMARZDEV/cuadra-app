import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";

import type { DockInteractionViewProps, DockOption } from "../interfaces";

// One HITL step rendered inside the glass dock (Figma "register expense" flow): a centered prompt
// with a row of option pills. The shape is generic — the backend (Fase 2) emits {prompt, options}
// and this paints it, so confirm/category/suggestion steps all reuse this. `value` (not the label)
// is what we report back, ready to feed /chat/resume.
function OptionPill({ option, onPress }: { option: DockOption; onPress: () => void }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const primary = option.variant === "primary";

  // primary = lime affirmative; secondary = translucent green. Theme-inverted so neither washes out.
  const bg = primary ? (isDark ? "#C2FB7E" : "#034842") : isDark ? "#16352A" : "#D9F5C2";
  const fg = primary ? (isDark ? "#04392B" : "#C2FB7E") : isDark ? "#C2FB7E" : "#034842";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
    >
      {option.icon ? <Icon as={option.icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 15, fontWeight: "700" }}>{option.label}</Text>
    </Pressable>
  );
}

export function DockInteractionView({ interaction, onSelect }: DockInteractionViewProps) {
  return (
    <View className="px-4 py-2">
      <Text className="mb-3 text-center text-lg leading-6 text-text">{interaction.prompt}</Text>
      <View className="flex-row flex-wrap justify-center gap-3">
        {interaction.options.map((option) => (
          <OptionPill key={option.value} option={option} onPress={() => onSelect(option.value)} />
        ))}
      </View>
    </View>
  );
}

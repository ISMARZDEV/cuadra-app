import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import type { DockInteractionViewProps, DockOption } from "../interfaces";

// One HITL step rendered inside the glass dock (register-expense flow, Img 8-11): a centered prompt
// with a row of options. Generic — the backend emits {prompt, options} and this paints it, so
// confirm / category / suggestion steps all reuse it. Two option kinds: `pill` (text button) and
// `chip` (round icon-only avatar, the category suggestions of Img 10). The whole option is reported
// back (the hook echoes the choice as a user bubble before resuming).

// primary = lime affirmative; secondary = translucent green. Theme-inverted so neither washes out.
function pillColors(primary: boolean, isDark: boolean) {
  const bg = primary ? (isDark ? "#C2FB7E" : "#034842") : isDark ? "#16352A" : "#D9F5C2";
  const fg = primary ? (isDark ? "#04392B" : "#C2FB7E") : isDark ? "#C2FB7E" : "#034842";
  return { bg, fg };
}

function OptionPill({ option, onPress }: { option: DockOption; onPress: () => void }) {
  const { colorScheme } = useColorScheme();
  const { bg, fg } = pillColors(option.variant === "primary", colorScheme === "dark");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label ?? option.value}
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
      {option.icon ? <Text style={{ fontSize: 16 }}>{option.icon}</Text> : null}
      <Text style={{ color: fg, fontSize: 15, fontWeight: "700" }}>{option.label}</Text>
    </Pressable>
  );
}

// Round icon-only avatar — a white disc with the category emoji (Img 10).
function IconChip({ option, onPress }: { option: DockOption; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.value}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
      }}
    >
      <Text style={{ fontSize: 22 }}>{option.icon}</Text>
    </Pressable>
  );
}

export function DockInteractionView({ interaction, onSelect }: DockInteractionViewProps) {
  return (
    <View className="px-4 py-2">
      <Text className="mb-3 text-center text-lg leading-6 text-text">{interaction.prompt}</Text>
      <View className="flex-row flex-wrap items-center justify-center gap-3">
        {interaction.options.map((option) =>
          option.kind === "chip" ? (
            <IconChip key={option.value} option={option} onPress={() => onSelect(option)} />
          ) : (
            <OptionPill key={option.value} option={option} onPress={() => onSelect(option)} />
          ),
        )}
      </View>
    </View>
  );
}

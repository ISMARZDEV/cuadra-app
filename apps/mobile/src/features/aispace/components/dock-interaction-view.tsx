import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import { sounds } from "@/lib/sounds";

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

// Round icon-only avatar — a white disc with the category emoji + a soft ring & shadow (Img 10).
function IconChip({ option, onPress }: { option: DockOption; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.value}
      onPress={onPress}
      style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 2.5,
        borderColor: option.color ?? "rgba(255,255,255,0.85)", // per-category ring (Img 10)
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
        elevation: 4,
      }}
    >
      <Text style={{ fontSize: 24 }}>{option.icon}</Text>
    </Pressable>
  );
}

// Render a prompt, highlighting **…** spans in lime (the money amount, Img 8): "…de **$500 USD**?".
function PromptText({ prompt, accent }: { prompt: string; accent: string }) {
  const parts = prompt.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text className="mb-3 text-center text-lg leading-6 text-text">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} style={{ color: accent, fontWeight: "800" }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function DockInteractionView({ interaction, onSelect }: DockInteractionViewProps) {
  const { colorScheme } = useColorScheme();
  // Readable lime: brand lime on dark, a deeper green on the off-white card.
  const accent = colorScheme === "dark" ? "#C2FB7E" : "#16A34A";
  // Same cue as sending a message (chat-input-bar.tsx) — picking a dock option (confirm/cancel,
  // category, currency…) is just as much a "commit" action. Centralized here (not per-component)
  // so both pill and chip options get it without duplicating the call.
  const handleSelect = (option: DockOption) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sounds.send();
    onSelect(option);
  };
  return (
    <View className="px-4 py-2">
      <PromptText prompt={interaction.prompt} accent={accent} />
      <View className="flex-row flex-wrap items-center justify-center gap-3">
        {interaction.options.map((option) =>
          option.kind === "chip" ? (
            <IconChip key={option.value} option={option} onPress={() => handleSelect(option)} />
          ) : (
            <OptionPill key={option.value} option={option} onPress={() => handleSelect(option)} />
          ),
        )}
      </View>
    </View>
  );
}

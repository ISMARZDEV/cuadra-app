import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { palette } from "@/theme";

import type { PersonalityOptionMeta } from "../interfaces";

interface PersonalityOptionProps {
  option: PersonalityOptionMeta;
  selected: boolean;
  onPress: () => void;
}

// One selectable personality row: emoji + label + description, a check when active. The whole
// row is the button (accessibilityLabel = the mode name → testable + screen-reader friendly).
export function PersonalityOption({ option, selected, onPress }: PersonalityOptionProps) {
  const label = t(option.labelKey);
  return (
    <Pressable
      role="radio"
      aria-label={label}
      aria-checked={selected}
      onPress={onPress}
      className={`mb-3 flex-row items-center gap-3 rounded-2xl border px-4 py-4 ${
        selected ? "border-primary bg-primary/10" : "border-border bg-surface"
      }`}
    >
      <Text className="text-3xl">{option.emoji}</Text>
      <View className="flex-1">
        <Text className="text-lg font-semibold text-text">{label}</Text>
        <Text className="text-sm text-muted">{t(option.descKey)}</Text>
      </View>
      {selected ? <Icon as={Check} size={22} color={palette.primary} /> : null}
    </Pressable>
  );
}

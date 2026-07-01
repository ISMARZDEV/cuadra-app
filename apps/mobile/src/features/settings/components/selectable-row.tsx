import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { palette } from "@/theme";

interface SelectableRowProps {
  leading: ReactNode; // emoji/flag/icon shown at the start
  label: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
  // "radio" (default) = single-choice (personality/language). "checkbox" = multi-choice (currency
  // extras). Both map to RN's unified ARIA props on web AND native — accessible + testable either way.
  role?: "radio" | "checkbox";
  disabled?: boolean; // non-interactive: the fixed primary currency, or a checkbox at its cap
}

// One selectable row: leading visual + label (+ optional description), with a check when active.
// Shared by the personality, language, and currency selectors.
export function SelectableRow({
  leading,
  label,
  desc,
  selected,
  onPress,
  role = "radio",
  disabled = false,
}: SelectableRowProps) {
  return (
    <Pressable
      role={role}
      aria-label={label}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      className={`mb-3 flex-row items-center gap-3 rounded-2xl border px-4 py-4 ${
        selected ? "border-primary bg-primary/10" : "border-border bg-surface"
      } ${disabled && !selected ? "opacity-40" : ""}`}
    >
      {leading}
      <View className="flex-1">
        <Text className="text-lg font-semibold text-text">{label}</Text>
        {desc ? <Text className="text-sm text-muted">{desc}</Text> : null}
      </View>
      {selected ? <Icon as={Check} size={22} color={palette.primary} /> : null}
    </Pressable>
  );
}

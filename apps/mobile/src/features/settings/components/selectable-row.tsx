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
}

// Single-choice row (a radio): leading visual + label (+ optional description), with a check when
// active. Shared by the personality and language selectors. Uses RN's unified ARIA props
// (role="radio" + aria-checked) which map on web AND native — accessible + testable.
export function SelectableRow({ leading, label, desc, selected, onPress }: SelectableRowProps) {
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
      {leading}
      <View className="flex-1">
        <Text className="text-lg font-semibold text-text">{label}</Text>
        {desc ? <Text className="text-sm text-muted">{desc}</Text> : null}
      </View>
      {selected ? <Icon as={Check} size={22} color={palette.primary} /> : null}
    </Pressable>
  );
}

import { Text } from "react-native";

import { t } from "@/i18n";

import type { PersonalityOptionMeta } from "../interfaces";
import { SelectableRow } from "./selectable-row";

interface PersonalityOptionProps {
  option: PersonalityOptionMeta;
  selected: boolean;
  onPress: () => void;
}

// One selectable personality row (emoji + label + description). Thin wrapper over the shared
// SelectableRow — keeps the option metadata → row mapping in one place.
export function PersonalityOption({ option, selected, onPress }: PersonalityOptionProps) {
  return (
    <SelectableRow
      leading={<Text className="text-3xl">{option.emoji}</Text>}
      label={t(option.labelKey)}
      desc={t(option.descKey)}
      selected={selected}
      onPress={onPress}
    />
  );
}

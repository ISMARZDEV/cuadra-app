import type { Personality } from "@cuadra/api-client";
import type { LucideIcon } from "lucide-react-native";

import type { TranslationKey } from "@/i18n";

// Presentation metadata for one selectable personality (the Cleo-style modes). `id` is the wire
// value sent to the backend; label/desc are i18n keys; emoji + icon are the visual cue.
export interface PersonalityOptionMeta {
  id: Personality;
  emoji: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
}

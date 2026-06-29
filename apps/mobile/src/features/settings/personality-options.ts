import { Flame, PartyPopper, Smile } from "lucide-react-native";

import type { PersonalityOptionMeta } from "./interfaces";

// The three selectable copilot personalities (mirror Cleo's modes). Order = neutral → coach →
// roast (calmest to spiciest). `id` matches the backend Personality enum (neutral/coach/roast).
export const PERSONALITY_OPTIONS: PersonalityOptionMeta[] = [
  {
    id: "neutral",
    emoji: "😐",
    labelKey: "personality.neutral.label",
    descKey: "personality.neutral.desc",
    icon: Smile,
  },
  {
    id: "coach",
    emoji: "🎉",
    labelKey: "personality.coach.label",
    descKey: "personality.coach.desc",
    icon: PartyPopper,
  },
  {
    id: "roast",
    emoji: "🔥",
    labelKey: "personality.roast.label",
    descKey: "personality.roast.desc",
    icon: Flame,
  },
];

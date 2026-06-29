import type { Lang } from "@/i18n";

// The selectable app languages (same set as the backend). Names are proper nouns — shown as-is in
// every locale (not translated). Flag = a quick visual cue.
export interface LanguageOptionMeta {
  id: Lang;
  flag: string;
  label: string;
}

export const LANGUAGE_OPTIONS: LanguageOptionMeta[] = [
  { id: "es", flag: "🇪🇸", label: "Español" },
  { id: "en", flag: "🇬🇧", label: "English" },
  { id: "pt", flag: "🇧🇷", label: "Português" },
];

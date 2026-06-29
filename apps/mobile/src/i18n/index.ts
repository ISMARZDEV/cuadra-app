import en from "./en.json";
import es from "./es.json";
import pt from "./pt.json";

// Minimal, dependency-free i18n (es/en/pt — same set as the backend). Swappable for
// i18next later without touching call sites: keep using `t(key)`. UI chrome strings only;
// chat replies arrive already localized from the agent (cuadra-mobile skill §5).
const dictionaries = { es, en, pt } as const;
export type Lang = keyof typeof dictionaries;
export type TranslationKey = keyof typeof es;

/** The device/system language (es/en/pt), the fallback when the user hasn't picked one (auto). */
export function deviceLanguage(): Lang {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
    if (tag in dictionaries) return tag as Lang;
  } catch {
    // Intl unavailable — fall through to default.
  }
  return "es";
}

let lang: Lang = deviceLanguage();

/** Override the active language (e.g. from device settings or a user preference). */
export function setLanguage(next: Lang): void {
  lang = next;
}

/** The app's CHOSEN language (es/en/pt) — the correct primary signal to send the chat backend. */
export function getLanguage(): Lang {
  return lang;
}

export function t(key: TranslationKey): string {
  return dictionaries[lang][key] ?? dictionaries.es[key] ?? key;
}

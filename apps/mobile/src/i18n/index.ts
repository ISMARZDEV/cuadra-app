import { useSyncExternalStore } from "react";

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
// Plain pub-sub so `useLang()` (below) can use React's `useSyncExternalStore` — the CORRECT, built-
// in primitive for "an external mutable value that some components need to reactively read", not an
// ad-hoc cross-subscription to a DIFFERENT store (use-language-store.tsx) that merely calls
// `setLanguage()` as a side effect. That indirection is what caused screens to go stale: a component
// subscribed to the LANGUAGE STORE re-renders on ITS OWN state changes, which usually — but isn't
// GUARANTEED to — line up with exactly when `lang` here actually changed. Subscribing directly to
// THIS module removes that whole class of ordering bugs.
const listeners = new Set<() => void>();

/** Override the active language (e.g. from device settings or a user preference). */
export function setLanguage(next: Lang): void {
  if (lang === next) return;
  lang = next;
  listeners.forEach((notify) => notify());
}

/** The app's CHOSEN language (es/en/pt) — the correct primary signal to send the chat backend. */
export function getLanguage(): Lang {
  return lang;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

/** Reactive read of the active language — call this (even if you discard the return value) in any
 * component that renders `t(...)` copy which must update live when the user changes the language,
 * without remounting. Plain `t()` alone reads a module var, invisible to React on its own. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLanguage);
}

// `params` interpolates `{token}` placeholders (e.g. `t("chat.emptyState.greeting", { name })`) —
// optional, so every existing `t(key)` call site is untouched.
export function t(key: TranslationKey, params?: Record<string, string>): string {
  const template = dictionaries[lang][key] ?? dictionaries.es[key] ?? key;
  if (!params) return template;
  return Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), template);
}

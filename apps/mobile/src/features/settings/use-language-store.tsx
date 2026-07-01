import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { deviceLanguage, type Lang, setLanguage } from "@/i18n";

// Language preference store. `auto` (default) follows the device/system language; turning it off
// lets the user pin es/en/pt. The chosen language drives the whole app's i18n (`setLanguage`) AND
// the chat `locale` (use-chat reads `getLanguage()`). Persisted so the choice survives restarts.
const LANGUAGE_KEY = "cuadra.language";

interface PersistedLanguage {
  auto: boolean;
  lang: Lang;
}

interface LanguageState extends PersistedLanguage {
  // False until `restore()` resolves — the root layout gates rendering the authenticated app on
  // this (same as it already does for auth `status === "loading"`) so NOTHING renders on the
  // user's pinned language before it's actually applied. Without this gate, the home screen (now
  // the chat, mounted immediately on launch — see (tabs)/_layout.tsx) rendered with whatever
  // `deviceLanguage()` resolved to at JS module-init time, and needed a LATER re-render (a
  // subsequent language change, or the fix in src/i18n's useLang()) to ever correct itself — on a
  // device where that never happened to fire again, it just stayed wrong indefinitely.
  restored: boolean;
  /** Load the persisted choice on app start (or fall back to auto/device). */
  restore: () => Promise<void>;
  /** Toggle following the system language. */
  setAuto: (auto: boolean) => Promise<void>;
  /** Pin a specific language (implies auto = off). */
  setLang: (lang: Lang) => Promise<void>;
}

// Push the effective language into the i18n module: device language when auto, else the pinned one.
function applyLanguage(auto: boolean, lang: Lang): void {
  setLanguage(auto ? deviceLanguage() : lang);
}

async function persist(value: PersistedLanguage): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, JSON.stringify(value));
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  auto: true,
  lang: deviceLanguage(),
  restored: false,

  restore: async () => {
    const raw = await SecureStore.getItemAsync(LANGUAGE_KEY);
    const value: PersistedLanguage = raw
      ? (JSON.parse(raw) as PersistedLanguage)
      : { auto: true, lang: deviceLanguage() };
    applyLanguage(value.auto, value.lang);
    set({ ...value, restored: true });
  },

  setAuto: async (auto) => {
    const { lang } = get();
    applyLanguage(auto, lang);
    await persist({ auto, lang });
    set({ auto });
  },

  setLang: async (lang) => {
    applyLanguage(false, lang);
    await persist({ auto: false, lang });
    set({ auto: false, lang });
  },
}));

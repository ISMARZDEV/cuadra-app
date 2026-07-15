import type { Locale } from "@/i18n/config";
import { translate, type MessageKey } from "@/i18n/messages";

// `/admin/*` está EXENTO del prefijo de ruta `/{locale}/{country}` (ver `pages/+guard.ts`), así
// que `usePageI18n()` (lee el locale de la URL vía `usePageContext`) SIEMPRE cae a DEFAULT_LOCALE
// dentro del admin — no hay señal de idioma en la URL para leer. Por eso el admin necesita su
// propio hook con el locale EXPLÍCITO, threadeado por SSR (`AdminShellData.locale`, resuelto desde
// `MeResponse.locale`), en vez de inferido del pathname.
//
// Deliberadamente un wrapper FINO sobre `translate` — sin fallback ni normalización propia: si una
// clave no existe para el locale, se comporta exactamente igual que `translate` hoy (indexa
// `MESSAGES[locale][key]`, que puede ser `undefined` para una key forzada por cast; no lanza).
export function useAdminI18n(locale: Locale) {
  const t = (key: MessageKey): string => translate(locale, key);
  return { locale, t };
}

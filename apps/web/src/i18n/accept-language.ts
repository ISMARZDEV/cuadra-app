import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

// Negocia el idioma de la UI desde el header Accept-Language del browser (SSR). PURO — sin DOM ni
// framework (Layer 1, testeable). Parsea "en-US,en;q=0.9,es;q=0.8", ordena por preferencia (q) y
// devuelve el primer idioma SOPORTADO (es/en/pt); sin match → DEFAULT_LOCALE. El PAÍS no se toca
// (multi-país es otro eje, F3) — solo el idioma dentro del país por defecto.
export function pickLocale(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";q=");
      const lang = (tag ?? "").split("-")[0].toLowerCase(); // "en-US" → "en"
      const q = qPart ? Number(qPart) : 1;
      return { lang, q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) {
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

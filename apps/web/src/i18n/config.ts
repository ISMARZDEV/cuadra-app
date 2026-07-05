// Configuración i18n + multi-país. Dos dimensiones ORTOGONALES:
//   locale  = idioma de la UI (es/en/pt) → prefijo de ruta + hreflang.
//   country = mercado (DO hoy; US/CO/BR…) → qué supermercados/precios (backend `market`).
// URL: /{locale}/{country}/... con slugs en INGLÉS (/product, /search).
// Los VALORES viven en locales.js (JS plano, compartido con el server Node); acá van tipos + UI.
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  DEFAULT_LOCALE,
  LOCALES,
  MARKET_BY_COUNTRY,
} from "./locales.js";

export { COUNTRIES, DEFAULT_COUNTRY, DEFAULT_LOCALE, LOCALES };

export type Locale = (typeof LOCALES)[number];
export type Country = (typeof COUNTRIES)[number];

export function marketOf(country: Country): string {
  return MARKET_BY_COUNTRY[country];
}

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function isCountry(value: string | undefined): value is Country {
  return !!value && (COUNTRIES as readonly string[]).includes(value);
}

// Nombre del país para el selector/UI, por locale.
export const COUNTRY_NAMES: Record<Locale, Record<Country, string>> = {
  es: { do: "República Dominicana" },
  en: { do: "Dominican Republic" },
  pt: { do: "República Dominicana" },
};

export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

// Tipos de locales.js (tuplas readonly → uniones Locale/Country con seguridad de tipos).
export const LOCALES: readonly ["es", "en", "pt"];
export const DEFAULT_LOCALE: "es";
export const COUNTRIES: readonly ["do"];
export const DEFAULT_COUNTRY: "do";
export const MARKET_BY_COUNTRY: Record<"do", string>;

// Constantes de idioma/país en JS plano A PROPÓSITO: las comparten TS (config.ts, tipadas por
// locales.d.ts) y el Express server con Node crudo (sitemap). Una sola fuente de verdad.
export const LOCALES = ["es", "en", "pt"];
export const DEFAULT_LOCALE = "es";
export const COUNTRIES = ["do"];
export const DEFAULT_COUNTRY = "do";
export const MARKET_BY_COUNTRY = { do: "DO" };

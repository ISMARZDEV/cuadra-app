import type { Country, Locale } from "../i18n/config";

// Augmenta el PageContext de Vike con nuestras dimensiones i18n (las setea +onBeforeRoute).
declare global {
  namespace Vike {
    interface PageContext {
      locale?: Locale;
      country?: Country;
      needsLocaleRedirect?: boolean;
      acceptLanguage?: string; // header del request (SSR) → negociación de idioma en el guard
    }
  }
}

export {};

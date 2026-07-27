import type { Locale } from "@/i18n/config";

const LOCALE_TAG: Record<Locale, string> = {
  es: "es-DO",
  en: "en-US",
  pt: "pt-BR",
};

/** Fecha corta para las celdas del catálogo. `null`/inválida → `—`, nunca "Invalid Date".
 *
 * `last_price_seen_at` es nullable de verdad (un canónico sin tiendas nunca tuvo precio), así que
 * el guion es un estado legítimo del dato y no un error a esconder. */
export function formatCatalogDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

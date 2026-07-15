import type { Locale } from "@/i18n/config";

// Frescura de una fuente para la tabla de Fuentes (contexto del badge de salud): la Antigüedad
// RELATIVA ("hace 1 día") + la marca absoluta ("12 jul, 21:02"). El backend expone `last_seen_at`
// crudo (UTC) y `product_count`; la Antigüedad se DERIVA acá (relativa a ahora), no viaja calculada.

// La consola de Fuentes es es-only por ahora (i18n pendiente); se fija "es" como en ReviewDetailScreen.
export const SOURCES_LOCALE = "es" as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Antigüedad relativa localizada ("hace 5 min" / "hace 3 h" / "hace 2 días"). `null` → "—" (nunca
 * ingerido). Elige la unidad MÁS GRANDE que aplique; `Intl.RelativeTimeFormat` localiza es/en/pt. */
export function formatRelativeAge(iso: string | null | undefined, locale: Locale, now: Date = new Date()): string {
  if (!iso) return "—";
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return "—";

  const diff = Math.max(0, now.getTime() - seen.getTime());
  // `always` (no `auto`) → "hace 1 día", no "ayer": en una tabla de ops de frescura la forma
  // numérica precisa y consistente lee mejor que el lenguaje relativo difuso.
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (diff >= DAY) return rtf.format(-Math.floor(diff / DAY), "day");
  if (diff >= HOUR) return rtf.format(-Math.floor(diff / HOUR), "hour");
  if (diff >= MINUTE) return rtf.format(-Math.floor(diff / MINUTE), "minute");
  // < 1 min → "ahora"/"now"/"agora" (acá sí `auto`, que da la palabra "0" natural).
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
}

/** Marca absoluta corta y localizada ("12 jul 2026, 21:02"), fijada a UTC para ser determinística
 * (el backend emite `last_seen_at` en UTC). `null` → "—". */
export function formatLastSeen(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    // AM/PM (12h) como la columna "Fecha del match" de la cola de revisión (`formatMatchTime`),
    // no 24h — misma fuente UTC determinística.
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(seen);
}

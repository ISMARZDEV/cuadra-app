import type { Locale } from "@/i18n/config";
import { formatAdminDateTime } from "@/features/admin/lib/format-datetime";

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

/** Marca absoluta corta y localizada. DELEGA en `formatAdminDateTime` (`admin/lib`): el formato es
 * el mismo en todo el admin y dos implementaciones se desincronizan en cuanto alguien toca una.
 * Se conserva el nombre porque acá la semántica es "última vez que se vio el producto". */
export function formatLastSeen(iso: string | null | undefined, locale: Locale): string {
  return formatAdminDateTime(iso, locale);
}

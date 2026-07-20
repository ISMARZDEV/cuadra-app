import type { Locale } from "@/i18n/config";

/**
 * La marca de tiempo ABSOLUTA del admin: `"12 jul 2026, 9:02 p. m."`.
 *
 * Dos decisiones que se heredan de la cola de revisión y de Fuentes, y que hay que respetar para que
 * el admin no termine con tres relojes distintos:
 *
 * - **12 horas con AM/PM**, no 24h. Es lo que ya usan `formatMatchTime` (cola de revisión) y
 *   `formatLastSeen` (Fuentes).
 * - **Fijada a UTC**, no al huso del navegador. El backend emite todo en UTC, así que renderizar en
 *   hora local haría que dos operadores en husos distintos vieran fechas distintas para el MISMO
 *   evento — y que un test pasara o fallara según dónde corriera.
 *
 * Vive en `admin/lib` y no dentro de un módulo: la usaban Fuentes y ahora Orquestación, y una
 * segunda implementación es como se empiezan a desincronizar los formatos.
 */
export function formatAdminDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

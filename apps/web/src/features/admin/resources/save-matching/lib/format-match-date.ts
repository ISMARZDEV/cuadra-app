import type { Locale } from "@/i18n/config";

// Fecha del match (columna "Fecha del match" del Figma 483:12411, ej. "Sab 2, Marzo 2026"):
// `Intl.DateTimeFormat` YA hace la localización real (mes/día de semana en es/en/pt) — lo único
// que el Intl no da gratis es la CAPITALIZACIÓN (en es/pt devuelve "sáb"/"marzo" en minúscula); se
// arma el string a mano con las partes para no depender de que el runtime devuelva Title Case.
export function formatMatchDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    // El backend emite `created_at` en UTC (`datetime.utcnow()`/tz-aware UTC) — fijar el
    // timezone acá hace el resultado determinístico sin importar dónde corra el navegador/CI
    // (evita que un offset negativo empuje la fecha un día atrás).
    timeZone: "UTC",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const weekday = capitalize(part("weekday").replace(/\.$/, ""));
  const day = part("day");
  const month = capitalize(part("month"));
  const year = part("year");

  return `${weekday} ${day}, ${month} ${year}`;
}

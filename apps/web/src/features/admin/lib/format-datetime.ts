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


/**
 * Primera línea del par fecha/hora del admin: `"Vie 19, Julio 2026"`.
 *
 * `Intl` ya localiza mes y día de semana en es/en/pt; lo único que NO da gratis es la
 * CAPITALIZACIÓN (en es/pt devuelve "vie"/"julio" en minúscula), así que el string se arma con las
 * partes en vez de confiar en que el runtime devuelva Title Case.
 *
 * Nació en la cola de revisión (`formatMatchDate`) y vive acá desde que la Orquestación necesitó el
 * mismo par: dos implementaciones del mismo formato se desincronizan en cuanto alguien toca una.
 */
export function formatAdminDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
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



/**
 * La hora CON SEGUNDOS: `"11:01:58 p. m."`. Para la línea de tiempo de una corrida (US-OR-D7).
 *
 * Los segundos no son un capricho de precisión: en una corrida real medida, cuatro eventos
 * consecutivos caen en el mismo minuto (`23:01:58`). Sin segundos la línea de tiempo se ve como si
 * todo hubiera pasado a la vez, y deja de responder la única pregunta que un log contesta — en qué
 * ORDEN y con cuánto tiempo entre medio.
 *
 * Mismas dos reglas del resto del admin: 12 horas con AM/PM y fijada a UTC.
 */
export function formatAdminTimeWithSeconds(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}


/** Segunda línea del par: `"4:54 p. m."`. Devuelve `""` —y no `—`— cuando no hay fecha: el guion ya
 * lo pone la línea de arriba, y repetirlo dejaría dos guiones apilados. */
export function formatAdminTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

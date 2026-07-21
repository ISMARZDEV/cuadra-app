import { formatAdminDate, formatAdminTime } from "@/features/admin/lib/format-datetime";
import type { Locale } from "@/i18n/config";

// Este par de formatos NACIÓ acá (columna "Fecha del match", Figma 483:12411/483:12419) y hoy lo
// comparten Orquestación y la tab de Assets, así que la implementación vive en `admin/lib`. Se
// conservan los nombres porque en esta pantalla la semántica es "cuándo se produjo el match".
// Delegar y no copiar: dos implementaciones del mismo formato se desincronizan en cuanto alguien
// toca una.

export function formatMatchDate(iso: string, locale: Locale): string {
  return formatAdminDate(iso, locale);
}

export function formatMatchTime(iso: string, locale: Locale): string {
  return formatAdminTime(iso, locale);
}

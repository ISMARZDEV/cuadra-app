import type { MessageKey } from "@/i18n/messages";

// Estados de calidad del canónico (US-CP-L3/L9). La clave del backend (`no_image`) NUNCA se le
// muestra al operador: acá se traduce a etiqueta + tooltip que explica QUÉ FALTA, que es lo que
// convierte el badge en algo accionable en vez de en una etiqueta de sistema.

export const QUALITY_STATUSES = [
  "complete",
  "no_image",
  "no_category",
  "no_providers",
  "no_quality",
  "stale_price",
  "possible_duplicate",
] as const;

export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const QUALITY_LABEL_KEY: Record<QualityStatus, MessageKey> = {
  complete: "admin.canonicalProducts.status.complete",
  no_image: "admin.canonicalProducts.status.no_image",
  no_category: "admin.canonicalProducts.status.no_category",
  no_providers: "admin.canonicalProducts.status.no_providers",
  no_quality: "admin.canonicalProducts.status.no_quality",
  stale_price: "admin.canonicalProducts.status.stale_price",
  possible_duplicate: "admin.canonicalProducts.status.possible_duplicate",
};

export const QUALITY_HINT_KEY: Record<QualityStatus, MessageKey> = {
  complete: "admin.canonicalProducts.statusHint.complete",
  no_image: "admin.canonicalProducts.statusHint.no_image",
  no_category: "admin.canonicalProducts.statusHint.no_category",
  no_providers: "admin.canonicalProducts.statusHint.no_providers",
  no_quality: "admin.canonicalProducts.statusHint.no_quality",
  stale_price: "admin.canonicalProducts.statusHint.stale_price",
  possible_duplicate: "admin.canonicalProducts.statusHint.possible_duplicate",
};

/** Color por estado. Verde = sano; ámbar = le falta algo; rojo = riesgo para las comparaciones.
 * `possible_duplicate` es el único rojo a propósito: un falso merge es el peor caso de Save. */
export const QUALITY_PILL_CLASS: Record<QualityStatus, string> = {
  complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  no_image: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  no_category: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  no_providers: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  no_quality: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  stale_price: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  possible_duplicate: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function isQualityStatus(value: string): value is QualityStatus {
  return (QUALITY_STATUSES as readonly string[]).includes(value);
}

export const MEASURE_LABEL_KEY: Record<string, MessageKey> = {
  mass: "admin.canonicalProducts.measure.mass",
  volume: "admin.canonicalProducts.measure.volume",
  count: "admin.canonicalProducts.measure.count",
};

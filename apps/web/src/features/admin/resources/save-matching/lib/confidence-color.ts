// Color-coding de confianza para la lista de la cola de revisión (feature #8, F2·B1).
// PURA (sin React, sin I/O): triage de un vistazo — oscuro = casi seguro, claro = necesita ojo.
//
// Los umbrales MIRRORAN los mismos umbrales semánticos que la cascada de matching en el backend
// (fuente de verdad: apps/api/src/contexts/save/infrastructure/matching/cascade/banding.py —
// MATCH_HIGH_THRESHOLD=0.85, MATCH_MID_THRESHOLD=0.55). Hardcodeados a propósito para este batch
// (sin abstracción prematura); si el Batch 10 spike retunea esos umbrales, actualizar ambos lados.
const CONFIDENCE_HIGH_THRESHOLD = 0.85;
const CONFIDENCE_MID_THRESHOLD = 0.55;

/**
 * Mapea un `confidence` (0..1, o `null` si no hubo candidatos) a una clase Tailwind para la fila
 * de la lista de revisión.
 *
 * - `>= 0.85` (banda "auto_link" del backend, casi nunca visible en la cola porque se auto-enlaza,
 *   pero puede aparecer si el filtro de la lista lo incluye igual) → estilo más oscuro/seguro.
 * - `[0.55, 0.85)` (banda "grey", territorio del Claude-judge) → estilo intermedio.
 * - `< 0.55`, o `null` (lista de candidatos vacía) → estilo más claro, señal de "necesita ojo".
 */
export function confidenceColor(confidence: number | null): string {
  if (confidence === null || confidence < CONFIDENCE_MID_THRESHOLD) {
    return "bg-rose-100 text-rose-900";
  }
  if (confidence < CONFIDENCE_HIGH_THRESHOLD) {
    return "bg-amber-500 text-white";
  }
  return "bg-emerald-700 text-white";
}

/**
 * Variante PILL para la columna "Confianza" de la tabla (Figma 483:12419): mismo triage por banda
 * que `confidenceColor` pero con fondo CLARO + texto oscuro (85%/94% verde, 55% ámbar, 26% rojo),
 * tal como el Figma. Reusa los mismos umbrales (fuente única).
 */
export function confidencePillClass(confidence: number | null): string {
  if (confidence === null || confidence < CONFIDENCE_MID_THRESHOLD) {
    return "bg-[#ffc4c4] text-[#8d0000] dark:bg-[#ffc4c4]/20 dark:text-[#ffc4c4]";
  }
  if (confidence < CONFIDENCE_HIGH_THRESHOLD) {
    return "bg-[#f8f48f] text-[#8d7300] dark:bg-[#f8f48f]/20 dark:text-[#f8f48f]";
  }
  return "bg-[#b4ff8f] text-[#1c8d00] dark:bg-[#b4ff8f]/20 dark:text-[#b4ff8f]";
}

/**
 * Clase Tailwind de STROKE (SVG) para el arco del `ConfidenceDonut` — mismo triage por banda que
 * `confidenceColor`/`confidencePillClass` pero como color de trazo, no `bg+text`. Reusa los mismos
 * umbrales (fuente única). Verde = casi seguro, ámbar = territorio del juez, rosa = necesita ojo.
 */
export function confidenceStrokeClass(confidence: number | null): string {
  if (confidence === null || confidence < CONFIDENCE_MID_THRESHOLD) {
    return "stroke-rose-400";
  }
  if (confidence < CONFIDENCE_HIGH_THRESHOLD) {
    return "stroke-amber-500";
  }
  return "stroke-emerald-500";
}

import type { Locale } from "@/i18n/config";

import {
  isMatchMethod,
  METHOD_SHORT_LABEL,
  methodVisual,
  NEUTRAL_METHOD_BADGE,
} from "../resources/save-matching/lib/method-palette";

export interface MethodBadgeProps {
  /** `AdminReviewQueueRowDto.method`: "ean" | "trgm" | "vector" | "hybrid" | "llm" | "human" (string
   * crudo — el backend no expone un enum estricto en el DTO, así que aceptamos cualquier string y
   * caemos a un estilo neutro con el valor tal cual si no lo reconocemos). */
  method: string;
  /** Aceptado por compat de API (los callers threadan el locale del admin), pero la etiqueta del
   * método NO se localiza — es el nombre técnico corto de la cascada (ver abajo). */
  locale?: Locale;
  className?: string;
}

// El pill por método (columna "Método" del Figma 483:12411). El color y la etiqueta vienen de la
// fuente ÚNICA `method-palette.ts` (misma que usa el chart "Métodos de Match" de los KPI cards).
// Un método crudo desconocido cae a estilo neutro mostrando el valor tal cual.
export function MethodBadge({ method, className }: MethodBadgeProps) {
  const visual = methodVisual(method);
  const style = visual?.badge ?? NEUTRAL_METHOD_BADGE;
  // Etiqueta = nombre técnico corto de la etapa (LLM/Human/Hybrid/Vector/EAN/Trgm), IDÉNTICO al del
  // chart "Métodos de Match" (Figma tabla) — NO se localiza (antes usaba el i18n, que mostraba "IA").
  const label = isMatchMethod(method) ? METHOD_SHORT_LABEL[method] : method;

  return (
    <span
      className={
        className ??
        `inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${style}`
      }
    >
      {label}
    </span>
  );
}

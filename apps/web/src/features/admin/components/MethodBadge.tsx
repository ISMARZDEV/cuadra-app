import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { translate, type MessageKey } from "@/i18n/messages";

export interface MethodBadgeProps {
  /** `AdminReviewQueueRowDto.method`: "ean" | "trgm" | "vector" | "hybrid" | "llm" | "human" (string
   * crudo — el backend no expone un enum estricto en el DTO, así que aceptamos cualquier string y
   * caemos a un estilo neutro con el valor tal cual si no lo reconocemos). */
  method: string;
  locale?: Locale;
  className?: string;
}

// Color pastel por método de la cascada de matching (columna "Método" del Figma 483:12411).
// APROXIMACIÓN de este batch — el Figma exacto (nodo pendiente) se ajusta en Batch 6; la intención
// hoy es una vibra consistente: EAN/trgm en verdes/teal (determinístico, alta confianza), vector en
// cyan, hybrid en violeta, llm en ámbar (el juez), human en rosa (fue a la cola de revisión).
const METHOD_STYLES: Record<string, string> = {
  ean: "bg-emerald-100 text-emerald-800",
  trgm: "bg-teal-100 text-teal-800",
  vector: "bg-cyan-100 text-cyan-800",
  hybrid: "bg-violet-100 text-violet-800",
  llm: "bg-amber-100 text-amber-800",
  human: "bg-rose-100 text-rose-800",
};

const NEUTRAL_STYLE = "bg-slate-100 text-slate-700";

const METHOD_LABEL_KEYS: Record<string, MessageKey> = {
  ean: "admin.method.ean",
  trgm: "admin.method.trgm",
  vector: "admin.method.vector",
  hybrid: "admin.method.hybrid",
  llm: "admin.method.llm",
  human: "admin.method.human",
};

export function MethodBadge({ method, locale = DEFAULT_LOCALE, className }: MethodBadgeProps) {
  const style = METHOD_STYLES[method] ?? NEUTRAL_STYLE;
  const labelKey = METHOD_LABEL_KEYS[method];
  const label = labelKey ? translate(locale, labelKey) : method;

  return (
    <span
      className={
        className ??
        `inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`
      }
    >
      {label}
    </span>
  );
}

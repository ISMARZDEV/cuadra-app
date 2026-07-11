import type { MessageKey } from "@/i18n/messages";

// Fuente ÚNICA de verdad del color por método de la cascada de matching (EAN → trgm → vector →
// hybrid → llm → human). La consumen el badge de la tabla (`MethodBadge`) Y el chart "Métodos de
// Match" de los KPI cards, para que el MISMO método se pinte con el MISMO color (regla dataviz: el
// color sigue a la ENTIDAD, en orden fijo, nunca ciclado). Un método nuevo se agrega en UN lugar.
//
// Regla de temas: los tamaños/espaciados NO viven acá (son responsabilidad de cada componente y son
// IDÉNTICOS en claro/oscuro). Acá solo viven COLORES en clases utilitarias con su variante `dark:`
// para contraste — sin hex crudos, sin px.

export enum MatchMethod {
  Ean = "ean",
  Trgm = "trgm",
  Vector = "vector",
  Hybrid = "hybrid",
  Llm = "llm",
  Human = "human",
}

export interface MethodVisual {
  /** Clases del pill (bg + text, con variante dark) — las consume `MethodBadge` (tabla). */
  badge: string;
  /** HEX saturado del relleno proporcional de la barra del KPI "Métodos de Match" (izquierda). */
  strong: string;
  /** HEX pastel del track de esa barra (el resto). Ambos EXACTOS del Figma. */
  pastel: string;
  /** Clave i18n de la etiqueta del método (la usa el badge de la tabla; el chart usa código corto). */
  labelKey: MessageKey;
}

// Dos usos por ENTIDAD: `badge` = pill semántico de la tabla; `strong`+`pastel` = la barra dos-tonos
// del KPI "Métodos de Match" (relleno saturado proporcional al % sobre un track pastel del método).
export const METHOD_VISUALS: Record<MatchMethod, MethodVisual> = {
  // `badge` = pills EXACTOS del Figma (nodo 483:12422): relleno saturado + texto oscuro del mismo
  // hue. La variante dark reusa el mismo hue translúcido + texto claro para contraste sobre superficie
  // oscura. EAN/Trgm no aparecen en el sample del Figma → derivados de su hue del KPI (`strong`).
  [MatchMethod.Ean]: {
    badge: "bg-[#d6b4ff] text-[#5b1a99] dark:bg-[#a939ff]/25 dark:text-[#d6b4ff]",
    strong: "#a939ff",
    pastel: "#eab1ff",
    labelKey: "admin.method.ean",
  },
  [MatchMethod.Trgm]: {
    badge: "bg-[#adffbe] text-[#0a7a2f] dark:bg-[#00d134]/25 dark:text-[#adffbe]",
    strong: "#00d134",
    pastel: "#adffbe",
    labelKey: "admin.method.trgm",
  },
  [MatchMethod.Vector]: {
    badge: "bg-[#83f5ff] text-[#007eb0] dark:bg-[#83f5ff]/25 dark:text-[#83f5ff]",
    strong: "#0caee0",
    pastel: "#96eeff",
    labelKey: "admin.method.vector",
  },
  [MatchMethod.Hybrid]: {
    badge: "bg-[#fe92f0] text-[#b0009f] dark:bg-[#fe92f0]/25 dark:text-[#fe92f0]",
    strong: "#ff69ac",
    pastel: "#fdbcdf",
    labelKey: "admin.method.hybrid",
  },
  [MatchMethod.Llm]: {
    badge: "bg-[#f4a130] text-[#844c00] dark:bg-[#f4a130]/25 dark:text-[#f4a130]",
    strong: "#e95500",
    pastel: "#fbcf7e",
    labelKey: "admin.method.llm",
  },
  [MatchMethod.Human]: {
    badge: "bg-[#fe9294] text-[#7d0003] dark:bg-[#fe9294]/25 dark:text-[#fe9294]",
    strong: "#b3110c",
    pastel: "#ff9595",
    labelKey: "admin.method.human",
  },
};

// Estilo neutro para un `method` crudo que no reconocemos (el DTO no expone un enum estricto).
export const NEUTRAL_METHOD_BADGE = "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300";

// Código corto del método para el chart "Métodos de Match" de los KPI (Figma: "Hybrid/LLM/Human/
// EAN/Vector/Trgm" — NO se localiza, es el nombre técnico de la etapa de la cascada). Distinto del
// `labelKey` i18n que usa el badge de la tabla.
export const METHOD_SHORT_LABEL: Record<MatchMethod, string> = {
  [MatchMethod.Ean]: "EAN",
  [MatchMethod.Trgm]: "Trgm",
  [MatchMethod.Vector]: "Vector",
  [MatchMethod.Hybrid]: "Hybrid",
  [MatchMethod.Llm]: "LLM",
  [MatchMethod.Human]: "Human",
};

/** Orden categórico FIJO de la cascada (dataviz: asignar hues en orden fijo, nunca ciclar). */
export const METHOD_ORDER: readonly MatchMethod[] = [
  MatchMethod.Ean,
  MatchMethod.Trgm,
  MatchMethod.Vector,
  MatchMethod.Hybrid,
  MatchMethod.Llm,
  MatchMethod.Human,
] as const;

/** `true` si el string crudo del DTO es un método conocido de la cascada. */
export function isMatchMethod(value: string): value is MatchMethod {
  return (METHOD_ORDER as readonly string[]).includes(value);
}

/** Visual del método, o `null` si no se reconoce (el caller decide el fallback neutro). */
export function methodVisual(method: string): MethodVisual | null {
  return isMatchMethod(method) ? METHOD_VISUALS[method] : null;
}

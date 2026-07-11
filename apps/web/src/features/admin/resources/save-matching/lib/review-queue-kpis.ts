import type { MessageKey } from "@/i18n/messages";

import { MatchMethod } from "./method-palette";

// Modelo de datos de los 4 KPI cards de la cola de revisión (Figma 549:10191).
//
// ⚠️ DATOS DEMO. El backend `GetMatchingMetrics` (Fase 4 · Observability) NO existe todavía, así que
// estos valores son placeholder FIJO para lograr fidelidad visual con el Figma. Se marcan con
// `KPI_DATA_IS_DEMO` para que la UI muestre un indicador honesto (nunca engañar a un operador con
// métricas inventadas — regla SAGRADA de Save). Cuando exista el endpoint, se reemplaza SOLO este
// módulo por un selector sobre el DTO real; los componentes (`KpiCard`, charts) no cambian.

/** Bandera de "estos números son demo" — la UI la surfacea con un badge/tooltip. */
export const KPI_DATA_IS_DEMO = true;

/** Sentimiento de un delta → color del pill (verde = bueno, ámbar = malo, gris = neutro). */
export enum KpiSentiment {
  Positive = "positive",
  Negative = "negative",
  Neutral = "neutral",
}

/** Un delta versus el período anterior (ej. "+12 productos", "+5pp", "-0.3 días"). */
export interface KpiDelta {
  /** Texto ya formateado (con signo) — no se recalcula en la vista. */
  label: string;
  /** Determina el color del pill, independiente del signo (bajar el tiempo en cola es BUENO). */
  sentiment: KpiSentiment;
}

/** Un punto de una serie temporal corta (barras / línea). */
export interface SeriesPoint {
  /** Etiqueta del eje (ej. "L", "M"...) — hoy solo para el `<title>`/tooltip, no se dibuja. */
  label: string;
  value: number;
}

/** Un segmento de la dona de auto-link (auto-enlazado vs pendiente). */
export interface GaugeSegment {
  pct: number;
  /** Clase de color del segmento (emerald para auto-link, muted para pendiente). */
  colorClass: string;
  labelKey: MessageKey;
}

/** Participación de un método en el mix de la última semana (chart del card "Métodos de Match"). */
export interface MethodShare {
  method: MatchMethod;
  /** Porcentaje 0..100. */
  pct: number;
}

// ── Fixtures demo (valores del Figma) ──────────────────────────────────────────────────────────

/** Card 1 — Cola Pendiente: nº pendiente + barras diarias (7 días). */
export const PENDING_QUEUE_KPI = {
  value: "221",
  delta: { label: "+12", sentiment: KpiSentiment.Positive } satisfies KpiDelta,
  bars: [
    { label: "L", value: 42 },
    { label: "M", value: 78 },
    { label: "X", value: 55 },
    { label: "J", value: 88 },
    { label: "V", value: 64 },
    { label: "S", value: 96 },
    { label: "D", value: 48 },
  ] satisfies SeriesPoint[],
} as const;

/** Card 2 — Auto-link Rate: % auto-enlazado + dona (auto-link vs pendiente). */
export const AUTO_LINK_KPI = {
  value: "72%",
  delta: { label: "+5pp", sentiment: KpiSentiment.Positive } satisfies KpiDelta,
  /** Etiqueta central del gauge (período del dato demo). */
  period: "Jul, 2026",
  // El Figma etiqueta ambos segmentos como "Auto-linked" (bug del mock) y suma 101 — acá se corrige:
  // 72 auto-enlazado + 28 pendiente = 100, con etiquetas honestas.
  segments: [
    // Auto-enlazado = verde (el arco); Pendiente = gris (el track del gauge, no verde).
    { pct: 72, colorClass: "text-brand-green", labelKey: "admin.reviewQueue.kpi.autoLink.linked" },
    { pct: 28, colorClass: "text-neutral-300 dark:text-neutral-600", labelKey: "admin.reviewQueue.kpi.autoLink.pending" },
  ] satisfies GaugeSegment[],
} as const;

/** Card 3 — Métodos de Match: nº de canales activos + mix por método (última semana). */
export const METHOD_MIX_KPI = {
  activeChannels: 6,
  // Suma 100. Orden de display por columnas (Figma): izq [hybrid, llm, human] · der [ean, vector, trgm].
  shares: [
    { method: MatchMethod.Hybrid, pct: 28 },
    { method: MatchMethod.Llm, pct: 18 },
    { method: MatchMethod.Human, pct: 7 },
    { method: MatchMethod.Ean, pct: 12 },
    { method: MatchMethod.Vector, pct: 35 },
    { method: MatchMethod.Trgm, pct: 0 },
  ] satisfies MethodShare[],
} as const;

/** Card 4 — Tiempo en Cola: mediana de resolución + tendencia (7 días) con pico anotado. */
export const QUEUE_TIME_KPI = {
  value: "1.2d",
  // Bajar el tiempo es BUENO → verde aunque el número sea negativo.
  delta: { label: "-0.3", sentiment: KpiSentiment.Positive } satisfies KpiDelta,
  line: [
    { label: "L", value: 1.4 },
    { label: "M", value: 1.1 },
    { label: "X", value: 1.3 },
    { label: "J", value: 0.9 },
    { label: "V", value: 1.6 },
    { label: "S", value: 1.5 },
    { label: "D", value: 1.2 },
  ] satisfies SeriesPoint[],
  /** Índice del punto destacado + su anotación (ej. "+30%"). */
  highlight: { index: 4, label: "+30%" },
} as const;

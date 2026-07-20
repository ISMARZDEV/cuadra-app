// Contrato de los KPI cards y sus charts.
//
// Vive ACÁ y no en `lib/review-queue-kpis.ts` a propósito: ese archivo son los fixtures DEMO de la
// cola de revisión y §5.1 del plan maestro manda BORRARLO completo cuando exista `GetMatchingMetrics`.
// Tener el tipo de un componente compartido dentro de un archivo condenado convertiría esa limpieza
// en una cascada de roturas — y la consola de Orquestación, que ya consume estos cards con datos
// REALES, se caería con él.

export enum KpiSentiment {
  Positive = "positive",
  Negative = "negative",
  Neutral = "neutral",
}

/** Punto de una serie para los mini-charts (barras/línea). */
export interface SeriesPoint {
  label: string;
  value: number;
}

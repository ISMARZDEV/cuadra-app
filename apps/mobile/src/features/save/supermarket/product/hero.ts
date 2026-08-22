import type { HistoryPoint } from "./chart/history-geometry";

/**
 * Los tres números que AFIRMA la cabecera del detalle y que nadie nos entrega hechos: cuánto
 * ahorras, cuánto valía la unidad antes, y hacia dónde va el precio.
 *
 * ⭐ Los tres pueden devolver `null`, y ésa es la parte importante. En un comparador de precios un
 * número inventado no es una licencia estética: es la mercancía. Un «AHORRO $0.00» donde no hubo
 * comparación afirma que miramos y no encontramos nada, que es peor que no decir nada.
 *
 * Viven en un módulo puro para poder probarlos sin montar pantalla — misma razón que
 * `product-view.ts` y `chart/history-geometry.ts`.
 */

export interface Savings {
  /** Cuánto se ahorra, en unidades menores. */
  amountMinor: number;
  /** Cuánto bajó, en % del precio ANTERIOR, redondeado. */
  percent: number;
}

/**
 * El ahorro contra el precio anterior de la misma tienda.
 *
 * El porcentaje se mide contra el ANTES, no contra el ahora: «bajó un 15%» significa que perdió el
 * 15% de lo que valía. Medirlo contra el precio nuevo daría un número mayor y halagador que no
 * responde a la pregunta que se hace el usuario.
 */
export function savingsOf(
  currentMinor: number,
  previousMinor: number | null | undefined,
): Savings | null {
  // `null` es «esta tienda nunca movió el precio»; un 0 es dato sucio de ingesta. Ninguno de los
  // dos permite dividir, y ninguno de los dos es un ahorro.
  if (previousMinor == null || previousMinor <= 0) return null;
  // Los precios SUBEN, y eso pasa de verdad. Un ahorro negativo pintado en verde sería mentira.
  if (currentMinor >= previousMinor) return null;

  const amountMinor = previousMinor - currentMinor;
  return { amountMinor, percent: Math.round((amountMinor / previousMinor) * 100) };
}

/**
 * El precio por unidad de ANTES, DERIVADO de la proporción.
 *
 * ⭐ El API no lo da, y no hace falta que lo dé: el precio y su unitario guardan entre los dos la
 * CANTIDAD del envase, que no cambió cuando cambió el precio. Si 442.00 son 221.00/kg, el envase
 * tiene 2 kg, así que los 520.00 de antes eran 260.00/kg. Derivarlo es exacto; pedirlo sería una
 * columna más que mantener.
 */
export function previousUnitPriceMinor(
  currentMinor: number,
  currentUnitMinor: number | null | undefined,
  previousMinor: number | null | undefined,
): number | null {
  // Sin unitario actual no hay proporción de la que tirar: pasa cuando el producto no declara
  // cantidad (pan por pieza, plato por unidad).
  if (currentUnitMinor == null || previousMinor == null) return null;
  if (currentMinor <= 0) return null;
  return Math.round((currentUnitMinor / currentMinor) * previousMinor);
}

export interface Trend {
  direction: "down" | "up" | "flat";
  /** Cuánto se movió, en % del precio INICIAL, siempre positivo. */
  percent: number;
}

/**
 * Hacia dónde va el precio, del primer punto del histórico al último.
 *
 * ⚠️ Los puntos se ORDENAN por fecha antes de leerlos. El orden con el que llegan del API no es un
 * contrato, y leyéndolos tal cual el mismo producto contaría una historia distinta según cómo se
 * hubieran guardado.
 */
export function trendOf(points: readonly HistoryPoint[] | undefined | null): Trend | null {
  // Un solo punto no es una tendencia: no hay contra qué compararlo. Dibujar «estable» afirmaría
  // que lo vigilamos un tiempo y no se movió.
  if (!points || points.length < 2) return null;

  const ordered = [...points].sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const first = ordered[0].priceMinor;
  const last = ordered[ordered.length - 1].priceMinor;
  if (first <= 0) return null;

  if (last === first) return { direction: "flat", percent: 0 };
  return {
    direction: last < first ? "down" : "up",
    percent: Math.round((Math.abs(last - first) / first) * 100),
  };
}

/** La forma mínima del histórico que este módulo necesita. Se escribe aquí para no acoplar la
 *  lógica pura al tipo generado del cliente, que cambia cuando cambia el API. */
interface HistorySeriesLike {
  provider_id: string;
  points: ReadonlyArray<{ price_minor: number; captured_at: string }>;
}

/**
 * Los puntos del histórico DE UNA TIENDA, ordenados y sin capturas ilegibles.
 *
 * ⭐ De UNA tienda, no de todas mezcladas: el precio grande de la pantalla es el de la más barata,
 * así que la tendencia tiene que hablar de ESA. Mezclando series, la chispa contaría la historia de
 * un precio que no es el que el usuario está mirando.
 *
 * Si esa tienda no tiene serie propia se cae a la primera que haya — mejor una tendencia real de
 * otra tienda del mismo producto que ninguna—, y eso se nota porque devuelve `[]` sólo cuando no
 * hay absolutamente nada.
 */
export function pointsForProvider(
  series: readonly HistorySeriesLike[] | undefined | null,
  providerId: string | undefined | null,
): HistoryPoint[] {
  if (!series || series.length === 0) return [];
  const mine = series.find((s) => s.provider_id === providerId) ?? series[0];
  return mine.points
    .map<HistoryPoint>((p) => ({
      capturedAtMs: Date.parse(p.captured_at),
      priceMinor: p.price_minor,
    }))
    // Una captura ilegible no se arrastra: un `NaN` en la fecha desordena todo lo demás.
    .filter((p) => Number.isFinite(p.capturedAtMs))
    .sort((a, b) => a.capturedAtMs - b.capturedAtMs);
}

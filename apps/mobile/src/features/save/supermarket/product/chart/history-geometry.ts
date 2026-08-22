// La geometría del histórico de precios, en funciones puras.
//
// ⭐ EL PUNTO ENTERO DE ESTE ARCHIVO: los puntos del histórico son CHANGE-ONLY. La ingesta escribe
// una fila SÓLO cuando el precio cambia, así que cada punto RIGE HASTA EL SIGUIENTE. Unirlos con
// una recta dibujaría todos los precios intermedios de la rampa, y ninguno de ellos existió nunca.
// En un producto cuyo valor es la confianza en un número, eso no es una licencia estética.

export interface HistoryPoint {
  capturedAtMs: number;
  priceMinor: number;
}

export interface XY {
  x: number;
  y: number;
}

/**
 * El trazo en ESCALONES: mantener el nivel hasta el instante del cambio (`H`), y sólo entonces
 * saltar (`V`).
 *
 * `endX` extiende el último tramo hasta el borde derecho, porque el precio vigente sigue rigiendo
 * hasta ahora mismo. Sin eso, el trazo termina en la última captura y se lee como si hubiéramos
 * dejado de mirar.
 */
export function stepPath(points: readonly XY[], endX?: number): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M${first.x},${first.y}`;
  for (const p of rest) d += ` H${p.x} V${p.y}`;
  if (endX !== undefined) d += ` H${endX}`;
  return d;
}

export interface Domain {
  startMs: number;
  endMs: number;
  minMinor: number;
  maxMinor: number;
}

/** Aire vertical cuando todas las capturas valen lo mismo, en tanto por uno del propio precio. */
const FLAT_PADDING = 0.08;
/** Ancho mínimo del eje de tiempo cuando sólo hay una captura, para no dividir por cero. */
const MIN_SPAN_MS = 60 * 60 * 1000;

/**
 * Los extremos del chart, sobre TODAS las series a la vez.
 *
 * Calcularlos por serie daría a cada tienda su propia escala, y dos líneas con escalas distintas en
 * el mismo recuadro son una comparación falsa — que es justo lo que este chart existe para hacer.
 *
 * El eje llega hasta AHORA, no hasta la última captura.
 */
export function chartDomain(
  series: readonly (readonly HistoryPoint[])[],
  nowMs: number,
): Domain | null {
  const all = series.flat();
  if (all.length === 0) return null;

  const prices = all.map((p) => p.priceMinor);
  let minMinor = Math.min(...prices);
  let maxMinor = Math.max(...prices);
  if (minMinor === maxMinor) {
    // Un producto que nunca movió el precio. Sin aire la escala mide 0 de alto, cada y sale NaN y
    // el chart desaparece sin decir por qué.
    const pad = Math.max(1, Math.round(minMinor * FLAT_PADDING));
    minMinor -= pad;
    maxMinor += pad;
  }

  const startMs = Math.min(...all.map((p) => p.capturedAtMs));
  const endMs = Math.max(nowMs, startMs + MIN_SPAN_MS);
  return { startMs, endMs, minMinor, maxMinor };
}

/** Lleva un punto del dominio al lienzo. `y` va invertida: en SVG el 0 está ARRIBA. */
export function project(
  point: HistoryPoint,
  domain: Domain,
  width: number,
  height: number,
): XY {
  const spanMs = domain.endMs - domain.startMs || 1;
  const spanMinor = domain.maxMinor - domain.minMinor || 1;
  return {
    x: ((point.capturedAtMs - domain.startMs) / spanMs) * width,
    y: height - ((point.priceMinor - domain.minMinor) / spanMinor) * height,
  };
}

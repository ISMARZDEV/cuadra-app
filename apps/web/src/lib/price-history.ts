// Lógica PURA del historial de precios (C9) — sin React ni SVG, testeable sola.
// El backend entrega series "change-only" (un punto = un CAMBIO de precio que rige hasta el
// siguiente cambio; el último rige hasta "ahora"). Acá se recorta por rango con baseline
// carry-in y se expanden los cambios en vértices de una línea escalonada (step-after).

export type HistoryRange = "1m" | "3m" | "all";

export interface HistoryPoint {
  price_minor: number;
  captured_at: string; // ISO 8601
}

export interface HistorySeries {
  provider_id: string;
  provider_name: string;
  points: HistoryPoint[];
}

const DAYS: Record<Exclude<HistoryRange, "all">, number> = { "1m": 30, "3m": 90 };

// Inicio de la ventana relativa a `now`. null = todo el histórico.
export function windowStart(range: HistoryRange, now: Date): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - DAYS[range] * 24 * 60 * 60 * 1000);
}

// Recorta una serie al rango con BASELINE CARRY-IN: el último cambio ANTERIOR al inicio de la
// ventana se conserva como un punto sintético en el inicio de la ventana (ese es el precio
// vigente al abrir el chart). Sin esto, el chart arrancaría vacío hasta el primer cambio dentro
// de la ventana. Devuelve los puntos ordenados por fecha.
export function seriesInRange(
  points: HistoryPoint[],
  range: HistoryRange,
  now: Date,
): HistoryPoint[] {
  const sorted = [...points].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  const start = windowStart(range, now);
  if (start === null) return sorted;
  const startMs = start.getTime();

  const inside = sorted.filter((p) => Date.parse(p.captured_at) >= startMs);
  const before = sorted.filter((p) => Date.parse(p.captured_at) < startMs);
  if (before.length === 0) return inside;

  const carry: HistoryPoint = {
    price_minor: before[before.length - 1].price_minor,
    captured_at: start.toISOString(),
  };
  return [carry, ...inside];
}

// Dominio [min, max] de precio con padding (10% del rango, o ±5% si es plano) para que la línea
// no toque los bordes. Nunca devuelve altura cero.
export function priceDomain(points: HistoryPoint[]): [number, number] {
  if (points.length === 0) return [0, 1];
  const prices = points.map((p) => p.price_minor);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) {
    const pad = Math.max(1, Math.round(min * 0.05));
    return [min - pad, max + pad];
  }
  const pad = Math.round((max - min) * 0.1);
  return [min - pad, max + pad];
}

// Vértice de la línea escalonada, en coordenadas de datos (ms epoch, precio en minor units).
export interface StepVertex {
  ms: number;
  price: number;
}

// Expande los cambios en una línea STEP-AFTER: cada precio se mantiene HORIZONTAL hasta el
// siguiente cambio (vértice extra en (t_next, precio_actual)) y luego SUBE/BAJA vertical. El
// último precio se mantiene hasta `endMs` ("ahora"). Es la forma correcta de graficar precios
// (no interpolar diagonalmente entre cambios).
export function stepVertices(points: HistoryPoint[], endMs: number): StepVertex[] {
  if (points.length === 0) return [];
  const vertices: StepVertex[] = [];
  for (let i = 0; i < points.length; i++) {
    const ms = Date.parse(points[i].captured_at);
    const price = points[i].price_minor;
    vertices.push({ ms, price });
    const nextMs = i + 1 < points.length ? Date.parse(points[i + 1].captured_at) : endMs;
    if (nextMs > ms) vertices.push({ ms: nextMs, price });
  }
  return vertices;
}

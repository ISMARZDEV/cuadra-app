import { describe, expect, it } from "vitest";

import {
  priceDomain,
  seriesInRange,
  stepVertices,
  windowStart,
  type HistoryPoint,
} from "./price-history";

const NOW = new Date("2026-07-04T00:00:00.000Z");

// Helper: fecha ISO a N días antes de NOW.
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("windowStart", () => {
  it("all → null (todo el histórico)", () => {
    expect(windowStart("all", NOW)).toBeNull();
  });
  it("1m → 30 días antes; 3m → 90 días antes", () => {
    expect(windowStart("1m", NOW)?.toISOString()).toBe(daysAgo(30));
    expect(windowStart("3m", NOW)?.toISOString()).toBe(daysAgo(90));
  });
});

describe("seriesInRange — baseline carry-in", () => {
  const points: HistoryPoint[] = [
    { price_minor: 40000, captured_at: daysAgo(120) }, // fuera de 1m y 3m
    { price_minor: 42000, captured_at: daysAgo(60) }, // fuera de 1m, dentro de 3m
    { price_minor: 45000, captured_at: daysAgo(10) }, // dentro de ambas
  ];

  it("all → devuelve todos, ordenados por fecha", () => {
    const out = seriesInRange(points, "all", NOW);
    expect(out.map((p) => p.price_minor)).toEqual([40000, 42000, 45000]);
  });

  it("1m → agrega baseline en el inicio de ventana con el precio vigente (42000)", () => {
    const out = seriesInRange(points, "1m", NOW);
    // baseline (42000 @ -30d) + el punto de -10d
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ price_minor: 42000, captured_at: daysAgo(30) });
    expect(out[1].price_minor).toBe(45000);
  });

  it("no inventa baseline si no hay cambios previos a la ventana", () => {
    const recent: HistoryPoint[] = [{ price_minor: 50000, captured_at: daysAgo(5) }];
    const out = seriesInRange(recent, "1m", NOW);
    expect(out).toEqual(recent);
  });
});

describe("priceDomain", () => {
  it("agrega padding del 10% del rango", () => {
    const [min, max] = priceDomain([
      { price_minor: 40000, captured_at: daysAgo(2) },
      { price_minor: 50000, captured_at: daysAgo(1) },
    ]);
    expect(min).toBe(39000); // 40000 - 1000
    expect(max).toBe(51000); // 50000 + 1000
  });

  it("serie plana → nunca altura cero (padding ±5%)", () => {
    const [min, max] = priceDomain([{ price_minor: 42000, captured_at: daysAgo(1) }]);
    expect(max).toBeGreaterThan(min);
  });
});

describe("stepVertices — línea escalonada (step-after)", () => {
  it("mantiene el precio horizontal hasta el próximo cambio y luego salta", () => {
    const t0 = Date.parse(daysAgo(10));
    const t1 = Date.parse(daysAgo(4));
    const end = NOW.getTime();
    const out = stepVertices(
      [
        { price_minor: 100, captured_at: daysAgo(10) },
        { price_minor: 120, captured_at: daysAgo(4) },
      ],
      end,
    );
    expect(out).toEqual([
      { ms: t0, price: 100 },
      { ms: t1, price: 100 }, // hold horizontal
      { ms: t1, price: 120 }, // salto vertical
      { ms: end, price: 120 }, // último precio se mantiene hasta "ahora"
    ]);
  });

  it("serie vacía → sin vértices", () => {
    expect(stepVertices([], NOW.getTime())).toEqual([]);
  });
});

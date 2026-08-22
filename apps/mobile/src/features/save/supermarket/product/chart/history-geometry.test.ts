import { describe, expect, test } from "vitest";

import { chartDomain, stepPath, type HistoryPoint } from "./history-geometry";

const p = (iso: string, minor: number): HistoryPoint => ({
  capturedAtMs: Date.parse(iso),
  priceMinor: minor,
});

const NOW = Date.parse("2026-08-19T12:00:00Z");

describe("stepPath", () => {
  test("dibuja ESCALONES: primero mantiene, luego salta", () => {
    // El precio rige HASTA el punto siguiente. Una recta entre los dos dibujaría todos los precios
    // intermedios, y ninguno de ellos existió jamás. Es la diferencia entre un chart y una mentira.
    expect(stepPath([{ x: 0, y: 10 }, { x: 50, y: 30 }])).toBe("M0,10 H50 V30");
  });

  test("el último tramo llega hasta el borde derecho: el precio vigente sigue rigiendo", () => {
    expect(stepPath([{ x: 0, y: 10 }, { x: 50, y: 30 }], 100)).toBe("M0,10 H50 V30 H100");
  });

  test("un solo punto es una recta horizontal, no un pixel suelto", () => {
    expect(stepPath([{ x: 0, y: 20 }], 100)).toBe("M0,20 H100");
  });

  test("sin puntos no hay trazo", () => {
    expect(stepPath([])).toBe("");
  });
});

describe("chartDomain", () => {
  test("abarca todas las series, no sólo la primera", () => {
    const d = chartDomain(
      [
        [p("2026-08-01T00:00:00Z", 16900)],
        [p("2026-08-10T00:00:00Z", 21000)],
      ],
      NOW,
    );

    expect(d).not.toBeNull();
    expect(d!.minMinor).toBe(16900);
    expect(d!.maxMinor).toBe(21000);
  });

  test("el eje de tiempo llega hasta AHORA, no hasta la última captura", () => {
    // Cortar en la última captura mentiría por omisión: daría a entender que dejamos de mirar.
    const d = chartDomain([[p("2026-08-01T00:00:00Z", 16900)]], NOW);

    expect(d!.endMs).toBe(NOW);
    expect(d!.startMs).toBe(Date.parse("2026-08-01T00:00:00Z"));
  });

  test("con un solo precio deja aire arriba y abajo en vez de dividir por cero", () => {
    // Un producto que nunca cambió de precio tiene min === max. Sin aire, la escala es 0 de alto y
    // toda la serie sale con y = NaN — el chart desaparece sin decir por qué.
    const d = chartDomain([[p("2026-08-01T00:00:00Z", 16900)]], NOW);

    expect(d!.maxMinor).toBeGreaterThan(d!.minMinor);
    expect(d!.minMinor).toBeLessThanOrEqual(16900);
    expect(d!.maxMinor).toBeGreaterThanOrEqual(16900);
  });

  test("una sola captura no deja el eje de tiempo en ancho cero", () => {
    const d = chartDomain([[p("2026-08-19T12:00:00Z", 16900)]], NOW);

    expect(d!.endMs).toBeGreaterThan(d!.startMs);
  });

  test("sin series no hay dominio", () => {
    expect(chartDomain([], NOW)).toBeNull();
    expect(chartDomain([[]], NOW)).toBeNull();
  });
});

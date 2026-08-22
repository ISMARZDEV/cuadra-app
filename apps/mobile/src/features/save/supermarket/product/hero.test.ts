import { describe, expect, test } from "vitest";

import { pointsForProvider, previousUnitPriceMinor, savingsOf, trendOf } from "./hero";

/**
 * Los tres números que la cabecera del diseño AFIRMA y que nadie nos da hechos: cuánto ahorras,
 * cuánto valía la unidad antes, y hacia dónde va el precio.
 *
 * En un comparador de precios un número inventado no es una licencia: es la mercancía. Por eso
 * cada uno de los tres tiene que poder devolver «no lo sé» en vez de un cero plausible.
 */
describe("el ahorro contra el precio anterior", () => {
  test("un precio que bajó ahorra la diferencia, y el porcentaje sale del ANTES", () => {
    // El % se mide contra el precio anterior, no contra el actual: «bajó un 15%» significa que
    // perdió el 15% de lo que valía, no que el nuevo sea el 15% del viejo.
    expect(savingsOf(44200, 52000)).toEqual({ amountMinor: 7800, percent: 15 });
  });

  test("sin precio anterior NO hay ahorro que enseñar", () => {
    // `null` es «esta tienda nunca movió el precio». Un 0 encendería un «AHORRO $0.00», que es
    // peor que no decir nada: afirma que comparamos y no ahorró.
    expect(savingsOf(44200, null)).toBeNull();
    expect(savingsOf(44200, undefined)).toBeNull();
  });

  test("un precio que SUBIÓ no se disfraza de ahorro", () => {
    // Pasa de verdad: los precios suben. Un ahorro negativo pintado en verde sería una mentira.
    expect(savingsOf(52000, 44200)).toBeNull();
  });

  test("un precio que no se movió tampoco es un ahorro", () => {
    expect(savingsOf(44200, 44200)).toBeNull();
  });

  test("un ANTES de cero no divide entre cero", () => {
    // Dato sucio de ingesta. Sin la guarda, el porcentaje sale `Infinity` y se pinta tal cual.
    expect(savingsOf(44200, 0)).toBeNull();
  });
});

describe("el precio por unidad de ANTES", () => {
  test("se DERIVA de la proporción, no se inventa", () => {
    // El API no da el unitario anterior. Pero el unitario y el precio guardan la cantidad del
    // envase, que no cambió: 442.00 → 221.00/kg son 2 kg, así que 520.00 fueron 260.00/kg.
    expect(previousUnitPriceMinor(44200, 22100, 52000)).toBe(26000);
  });

  test("sin unitario actual no hay proporción de la que tirar", () => {
    // `unit_price_minor` es `null` cuando el producto no declara cantidad (pan por pieza).
    expect(previousUnitPriceMinor(44200, null, 52000)).toBeNull();
  });

  test("sin precio anterior no hay nada que derivar", () => {
    expect(previousUnitPriceMinor(44200, 22100, null)).toBeNull();
  });

  test("un precio actual de cero no divide entre cero", () => {
    expect(previousUnitPriceMinor(0, 22100, 52000)).toBeNull();
  });
});

describe("hacia dónde va el precio", () => {
  const p = (ms: number, price: number) => ({ capturedAtMs: ms, priceMinor: price });

  test("del primer punto al último: si bajó, la tendencia es a la BAJA", () => {
    expect(trendOf([p(1, 52000), p(2, 48000), p(3, 44200)])).toEqual({
      direction: "down",
      percent: 15,
    });
  });

  test("si subió, la tendencia es al ALZA", () => {
    expect(trendOf([p(1, 44200), p(2, 52000)])?.direction).toBe("up");
  });

  test("los puntos llegan DESORDENADOS y hay que ordenarlos por fecha", () => {
    // El histórico viene del API y su orden no es un contrato. Leyendo el array tal cual, el
    // mismo producto contaría una historia distinta según cómo se guardó.
    expect(trendOf([p(3, 44200), p(1, 52000), p(2, 48000)])).toEqual({
      direction: "down",
      percent: 15,
    });
  });

  test("un solo punto no es una tendencia", () => {
    // No hay contra qué compararlo. Dibujar «estable» afirmaría que lo vigilamos y no se movió.
    expect(trendOf([p(1, 44200)])).toBeNull();
    expect(trendOf([])).toBeNull();
    expect(trendOf(undefined)).toBeNull();
  });

  test("un precio que no se movió es ESTABLE, que no es lo mismo que no saber", () => {
    expect(trendOf([p(1, 44200), p(2, 44200)])).toEqual({ direction: "flat", percent: 0 });
  });
});

describe("los puntos del histórico de UNA tienda", () => {
  const serie = (id: string, precios: number[]) => ({
    provider_id: id,
    points: precios.map((price_minor, i) => ({
      price_minor,
      captured_at: `2026-08-0${i + 1}T00:00:00Z`,
    })),
  });

  test("devuelve los de la tienda pedida, no una mezcla", () => {
    // El precio grande de la pantalla es el de la más barata: la tendencia tiene que hablar de ESA.
    // Mezclando series, la chispa contaría la historia de un precio que nadie está mirando.
    const pts = pointsForProvider([serie("a", [100, 90]), serie("b", [500, 400])], "b");
    expect(pts.map((p) => p.priceMinor)).toEqual([500, 400]);
  });

  test("sin serie propia cae a la primera, que es mejor que ninguna", () => {
    expect(pointsForProvider([serie("a", [100, 90])], "no-existe").length).toBe(2);
  });

  test("una captura con fecha ilegible se DESCARTA, no se arrastra", () => {
    // Un `NaN` en la fecha desordena todo lo demás y el trazo entero se vuelve basura.
    const pts = pointsForProvider(
      [{ provider_id: "a", points: [{ price_minor: 100, captured_at: "no-es-fecha" }] }],
      "a",
    );
    expect(pts).toEqual([]);
  });

  test("sin series no inventa nada", () => {
    expect(pointsForProvider([], "a")).toEqual([]);
    expect(pointsForProvider(undefined, "a")).toEqual([]);
  });
});

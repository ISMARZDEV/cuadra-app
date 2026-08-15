import { describe, expect, test } from "vitest";

import {
  CARD_DISCOUNT_OVERHANG,
  CARD_WIDTH,
  RAIL_SCALE,
  cardWidthAt,
  gridScaleFor,
} from "./basket-product-card";

// La tarjeta se usa a DOS tamaños: el de los carruseles (chat, canasta, proveedor, rails de Save) y
// uno más chico para la rejilla de 3 columnas del «ver más». Lo que se afirma acá es que meter el
// segundo NO movió el primero — que es la única forma de tocar un componente con cuatro
// consumidores vivos sin romperlos en silencio.
describe("la escala de los carruseles no se mueve", () => {
  test("CARD_WIDTH sigue valiendo lo de siempre", () => {
    expect(CARD_WIDTH).toBe(148); // round(164 * 0.9)
  });

  test("el asomo del sello de oferta sigue valiendo lo de siempre", () => {
    expect(CARD_DISCOUNT_OVERHANG).toBe(9); // round(10 * 0.9)
  });

  test("la escala por defecto ES la de los carruseles", () => {
    expect(cardWidthAt(RAIL_SCALE)).toBe(CARD_WIDTH);
  });
});

// La rejilla NO usa una escala fija. Es la misma lección que la sangría del hub: un número fijo es
// holgado en un Pro Max y desborda en un SE. Se deriva del ancho que de verdad hay.
describe("la escala de la rejilla se deriva del ancho disponible", () => {
  const gutter = 14;
  const gap = 10;
  // 3 columnas: ancho − 2·margen − 2·hueco, repartido en tres.
  const columnWidth = (screen: number) => (screen - gutter * 2 - gap * 2) / 3;

  test("tres tarjetas + huecos + márgenes CABEN en la pantalla", () => {
    for (const screen of [375, 393, 402, 430]) {
      const w = cardWidthAt(gridScaleFor(columnWidth(screen)));

      expect(w * 3 + gap * 2 + gutter * 2).toBeLessThanOrEqual(screen);
    }
  });

  test("en la rejilla la tarjeta es MÁS CHICA que en los carruseles", () => {
    for (const screen of [375, 393, 402, 430]) {
      expect(cardWidthAt(gridScaleFor(columnWidth(screen)))).toBeLessThan(CARD_WIDTH);
    }
  });

  // Una tarjeta más ancha en una pantalla más ancha: si esto se invierte, el reparto está mal.
  test("crece con la pantalla", () => {
    const small = cardWidthAt(gridScaleFor(columnWidth(375)));
    const large = cardWidthAt(gridScaleFor(columnWidth(430)));

    expect(large).toBeGreaterThan(small);
  });
});

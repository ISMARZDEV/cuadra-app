import { describe, expect, test } from "vitest";

import {
  CARD_DISCOUNT_OVERHANG,
  CARD_WIDTH,
  RAIL_SCALE,
  cardWidthAt,
  cardPalette,
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

// ── La paleta de la tarjeta ────────────────────────────────────────────────────
//
// Los colores salen de una función PURA y no de veinte literales sueltos por el JSX. Es lo que hace
// que el tema oscuro sea auditable: acá se ve de un golpe qué cambia y qué NO, en vez de tener que
// leer seiscientas líneas de marcado para descubrir que un `#034842` se quedó sin pareja.
describe("la paleta de la tarjeta", () => {
  test("en claro es EXACTAMENTE la de siempre", () => {
    const c = cardPalette("light");
    // La tarjeta clara está aprobada visualmente: el tema oscuro no puede moverla ni un dígito.
    expect(c.shell).toBe("#FFFFFF");
    expect(c.shellStroke).toBe("#F4F4F4");
    expect(c.name).toBe("#131313");
    expect(c.price).toBe("#034842");
    expect(c.meta).toBe("#898989");
    expect(c.previousPrice).toBe("#A62B2B");
  });

  test("en oscuro la cáscara iguala al resto de superficies de la app", () => {
    // El MISMO `#151515` de la píldora del buscador y del card del hub. Una superficie oscura más,
    // no un gris nuevo: la app ya tiene un negro de superficie y este es ese.
    expect(cardPalette("dark").shell).toBe("#151515");
  });

  test("el precio sigue el par de marca que ya existe en la app", () => {
    // `insights-wheel` ya establece el intercambio: verde profundo en claro, lima en oscuro. El
    // precio es el elemento más importante de la tarjeta — no puede estrenar un color propio.
    expect(cardPalette("light").price).toBe("#034842");
    expect(cardPalette("dark").price).toBe("#C2FB7E");
  });

  test("el precio anterior se ACLARA en oscuro en vez de quedarse en el rojo profundo", () => {
    // `#A62B2B` sobre `#151515` es ilegible: son dos oscuros. Tachado y todo, tiene que leerse.
    expect(cardPalette("dark").previousPrice).not.toBe("#A62B2B");
  });

  test("la placa de la foto sigue siendo BLANCA en los dos temas", () => {
    // No es un descuido: las fotos son JPEG sin canal alfa y con fondo blanco puro (verificado
    // contra el CDN de VTEX). Cualquier otro color le dibujaría un recuadro alrededor.
    expect(cardPalette("light").photoPlate).toBe("#FFFFFF");
    expect(cardPalette("dark").photoPlate).toBe("#FFFFFF");
  });

  test("en oscuro la placa se REDONDEA, para que el blanco se lea como decisión", () => {
    // El blanco es inevitable; que parezca deliberado no lo es. En claro se funde con la cáscara y
    // no necesita radio; en oscuro es una placa y sí.
    expect(cardPalette("light").photoRadius).toBe(0);
    expect(cardPalette("dark").photoRadius).toBeGreaterThan(0);
  });
});

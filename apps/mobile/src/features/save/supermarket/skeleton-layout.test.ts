import { describe, expect, test } from "vitest";

import { CIRCLE_SIZE, SLOT_ANGLES, arcFor, pointOnArc } from "./arc-geometry";
import {
  CARD_ASPECT,
  arcSkeletonShapes,
  gridSkeletonShapes,
  railSkeletonShapes,
} from "./skeleton-layout";

// Lo que se afirma acá es UNA cosa: el esqueleto ocupa el sitio EXACTO de lo que va a llegar. Si no
// lo hiciera, al terminar de cargar el contenido aparecería desplazado respecto al hueco prometido
// y la pantalla pegaría un salto — que se lee peor que no haber puesto esqueleto.
const W = 402;
const GUTTER = 14;

describe("el esqueleto de un rail", () => {
  test("sus tarjetas fantasma miden lo que la tarjeta real", () => {
    const { shapes } = railSkeletonShapes({ width: W, gutter: GUTTER, cardWidth: 148, gap: 5 });
    const cards = shapes.filter((s) => s.width === 148);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.height).toBe(Math.round(148 * CARD_ASPECT));
  });

  test("arranca en la MISMA sangría que el rail de verdad", () => {
    const { shapes } = railSkeletonShapes({ width: W, gutter: GUTTER, cardWidth: 148, gap: 5 });
    for (const shape of shapes) expect(shape.x).toBeGreaterThanOrEqual(GUTTER);
    expect(shapes[0].x).toBe(GUTTER);
  });

  test("la fila ASOMA por el canto derecho, como el carrusel real", () => {
    // Si terminara dentro de la pantalla, el esqueleto prometería una lista que se acaba a la vista
    // y al llegar los datos aparecería una tarjeta cortada donde antes no había nada.
    const { shapes } = railSkeletonShapes({ width: W, gutter: GUTTER, cardWidth: 148, gap: 5 });
    const cards = shapes.filter((s) => s.width === 148);
    const last = cards[cards.length - 1];
    expect(last.x + last.width).toBeGreaterThan(W);
  });

  test("las dos barras de texto NO miden lo mismo", () => {
    // Dos barras iguales se leen como una tabla, no como un título con su bajada.
    const { shapes } = railSkeletonShapes({ width: W, gutter: GUTTER, cardWidth: 148, gap: 5 });
    expect(shapes[0].width).not.toBe(shapes[1].width);
    expect(shapes[0].height).toBeGreaterThan(shapes[1].height);
  });

  test("declara el alto que de verdad ocupa", () => {
    const { shapes, height } = railSkeletonShapes({
      width: W,
      gutter: GUTTER,
      cardWidth: 148,
      gap: 5,
    });
    const bottom = Math.max(...shapes.map((s) => s.y + s.height));
    expect(height).toBe(bottom);
  });
});

describe("el esqueleto de la rejilla", () => {
  const opts = {
    gutter: GUTTER,
    columns: 3,
    columnGap: 10,
    rowGap: 6,
    cardWidth: 110,
    rows: 3,
  };

  test("saca filas COMPLETAS de tres", () => {
    const { shapes } = gridSkeletonShapes(opts);
    expect(shapes).toHaveLength(9);
  });

  test("respeta la sangría y los huecos de la rejilla real", () => {
    const { shapes } = gridSkeletonShapes(opts);
    expect(shapes[0].x).toBe(GUTTER);
    expect(shapes[1].x - shapes[0].x).toBe(110 + 10);
    // La segunda fila arranca un alto de tarjeta más el hueco de fila por debajo.
    expect(shapes[3].y - shapes[0].y).toBe(Math.round(110 * CARD_ASPECT) + 6);
  });

  test("la última columna cabe DENTRO de la pantalla", () => {
    // La rejilla no asoma —a diferencia del rail—: sus tres columnas caben justas.
    const { shapes } = gridSkeletonShapes(opts);
    const right = Math.max(...shapes.map((s) => s.x + s.width));
    expect(right).toBeLessThanOrEqual(W - GUTTER + 1);
  });

  test("declara el alto que de verdad ocupa", () => {
    const { shapes, height } = gridSkeletonShapes(opts);
    expect(height).toBe(Math.max(...shapes.map((s) => s.y + s.height)));
  });
});

describe("el esqueleto de la ruleta", () => {
  test("pone un círculo en cada posición en REPOSO del arco", () => {
    const shapes = arcSkeletonShapes(W);
    expect(shapes).toHaveLength(SLOT_ANGLES.length);
  });

  test("los coloca SOBRE la curva, no en fila recta", () => {
    // Si el esqueleto los alineara, al llegar los datos saltarían a la curva y el header daría un
    // tirón. Cada círculo cae exactamente donde caerá su categoría.
    const arc = arcFor(W);
    const shapes = arcSkeletonShapes(W);
    shapes.forEach((shape, i) => {
      const at = pointOnArc(arc, SLOT_ANGLES[i]);
      expect(shape.x + CIRCLE_SIZE / 2).toBeCloseTo(at.x, 5);
      expect(shape.y + CIRCLE_SIZE / 2).toBeCloseTo(at.y, 5);
    });
    // Y de verdad están a alturas distintas: el arco sube por los costados.
    const alturas = new Set(shapes.map((s) => Math.round(s.y)));
    expect(alturas.size).toBeGreaterThan(1);
  });

  test("son redondos: el radio es la mitad del lado", () => {
    for (const shape of arcSkeletonShapes(W)) {
      expect(shape.width).toBe(shape.height);
      expect(shape.radius).toBe(shape.width / 2);
    }
  });
});

import { SLOT_ANGLES, arcFor, CIRCLE_SIZE, pointOnArc } from "./arc-geometry";
import type { ShimmerShape } from "../components/shimmer-skeleton";

// La GEOMETRÍA de los esqueletos de Supermarket.
//
// Vive aparte y en funciones PURAS por una razón concreta: un esqueleto sólo cumple su trabajo si
// ocupa el sitio EXACTO de lo que va a llegar. Si no, al terminar de cargar la pantalla pega un
// salto —el contenido aparece desplazado respecto al hueco que se había prometido— y eso se lee
// peor que no haber puesto esqueleto. Con la forma calculada aquí, los tests pueden afirmar que el
// hueco y el contenido miden lo mismo.

/**
 * Alto de la tarjeta de producto en proporción a su ancho.
 *
 * MEDIDO sobre el render real (261pt de alto para 148 de ancho), no estimado: la tarjeta NO tiene
 * alto fijo —crece con su contenido, y un `aspectRatio` fijo fue el origen de dos defectos según su
 * propio código—, así que no hay ninguna constante que importar. Se mide y se anota de dónde salió.
 */
export const CARD_ASPECT = 1.76;

/** Alto de las barras que hacen de título y de bajada en el esqueleto de un rail. */
const TITLE_H = 22;
const SUBTITLE_H = 14;
const TITLE_GAP = 8;
/** Aire entre la bajada y la fila de tarjetas. */
const HEAD_GAP = 16;
/** Anchos de las barras de texto. Distintos a propósito: dos iguales se leen como una tabla. */
const TITLE_W = 210;
const SUBTITLE_W = 150;
const BAR_RADIUS = 7;
/** Radio de la tarjeta fantasma. Cercano al de la tarjeta real, sin imitar su festón: un esqueleto
 *  anuncia el HUECO, no dibuja el contenido. */
const CARD_RADIUS = 16;

/** El hueco de UN rail: sus dos barras de texto y la fila de tarjetas que asoma por el canto. */
export function railSkeletonShapes(opts: {
  width: number;
  gutter: number;
  cardWidth: number;
  gap: number;
}): { shapes: ShimmerShape[]; height: number } {
  const { width, gutter, cardWidth, gap } = opts;
  const cardHeight = Math.round(cardWidth * CARD_ASPECT);
  const shapes: ShimmerShape[] = [
    { x: gutter, y: 0, width: TITLE_W, height: TITLE_H, radius: BAR_RADIUS },
    {
      x: gutter,
      y: TITLE_H + TITLE_GAP,
      width: SUBTITLE_W,
      height: SUBTITLE_H,
      radius: BAR_RADIUS,
    },
  ];

  const top = TITLE_H + TITLE_GAP + SUBTITLE_H + HEAD_GAP;
  // Se dibujan las que caben MÁS UNA: la fila tiene que asomar por el canto derecho igual que el
  // carrusel real, o el esqueleto promete una lista que se acaba en pantalla.
  for (let x = gutter; x < width; x += cardWidth + gap) {
    shapes.push({ x, y: top, width: cardWidth, height: cardHeight, radius: CARD_RADIUS });
  }

  return { shapes, height: top + cardHeight };
}

/** El hueco de la REJILLA de «Categorías»: filas de tarjetas a `columns` columnas. */
export function gridSkeletonShapes(opts: {
  gutter: number;
  columns: number;
  columnGap: number;
  rowGap: number;
  cardWidth: number;
  rows: number;
}): { shapes: ShimmerShape[]; height: number } {
  const { gutter, columns, columnGap, rowGap, cardWidth, rows } = opts;
  const cardHeight = Math.round(cardWidth * CARD_ASPECT);
  const shapes: ShimmerShape[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      shapes.push({
        x: gutter + col * (cardWidth + columnGap),
        y: row * (cardHeight + rowGap),
        width: cardWidth,
        height: cardHeight,
        radius: CARD_RADIUS,
      });
    }
  }

  return { shapes, height: rows * cardHeight + (rows - 1) * rowGap };
}

/**
 * Los círculos fantasma de la ruleta, en las CUATRO posiciones en reposo del arco.
 *
 * Se colocan con la misma geometría que las categorías de verdad (`pointOnArc`), no con una fila
 * recta: si el esqueleto los pusiera alineados, al llegar los datos saltarían a la curva y el
 * header entero daría un tirón.
 */
export function arcSkeletonShapes(width: number): ShimmerShape[] {
  const arc = arcFor(width);
  return SLOT_ANGLES.map((angle) => {
    const at = pointOnArc(arc, angle);
    return {
      x: at.x - CIRCLE_SIZE / 2,
      y: at.y - CIRCLE_SIZE / 2,
      width: CIRCLE_SIZE,
      height: CIRCLE_SIZE,
      radius: CIRCLE_SIZE / 2,
    };
  });
}

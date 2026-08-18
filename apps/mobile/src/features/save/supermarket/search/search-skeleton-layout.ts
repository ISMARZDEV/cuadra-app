import type { ShimmerShape } from "../../components/shimmer-skeleton";

// La GEOMETRÍA del esqueleto de las filas del buscador.
//
// Mismo criterio que `skeleton-layout.ts`: pura y aparte, porque un esqueleto sólo cumple su
// trabajo si ocupa el sitio EXACTO de lo que va a llegar. Cuadrando el hueco con la fila real, los
// tests pueden AFIRMAR que no habrá salto — en vez de que lo descubra el usuario.

/** Diámetro del disco que hace de icono (reloj en recientes, lupa en sugerencias). */
export const ICON_SIZE = 44;
/** Aire entre el icono y el texto. */
const ICON_GAP = 14;
/** Alto de una fila entera, con su aire arriba y abajo. */
export const ROW_HEIGHT = 64;

/** Las dos barras de texto. La bajada más corta y más fina: dos barras iguales se leen como una
 *  tabla, no como una fila con jerarquía. */
const TITLE_H = 15;
const SUBTITLE_H = 11;
const TITLE_GAP = 7;
const BAR_RADIUS = 6;
/** Qué proporción del ancho disponible ocupa cada barra. En proporción y no en puntos fijos, por la
 *  misma razón que la sangría del hub: un número fijo dice cosas distintas en un SE y en un Pro Max. */
const TITLE_RATIO = 0.52;
const SUBTITLE_RATIO = 0.32;

/**
 * El hueco de una lista de filas del buscador: por cada fila, su disco y sus dos barras.
 *
 * Las tres formas de una fila se centran sobre el mismo eje vertical que el contenido real, así que
 * al sustituirse nada se mueve.
 */
export function searchRowsSkeletonShapes(opts: {
  width: number;
  gutter: number;
  rows: number;
}): { shapes: ShimmerShape[]; height: number } {
  const { width, gutter, rows } = opts;
  if (rows <= 0) return { shapes: [], height: 0 };

  const textX = gutter + ICON_SIZE + ICON_GAP;
  const available = width - textX - gutter;
  const shapes: ShimmerShape[] = [];

  for (let i = 0; i < rows; i += 1) {
    const top = i * ROW_HEIGHT;
    shapes.push({
      x: gutter,
      y: top + (ROW_HEIGHT - ICON_SIZE) / 2,
      width: ICON_SIZE,
      height: ICON_SIZE,
      radius: ICON_SIZE / 2,
    });
    // El bloque de texto se centra en la fila igual que el icono: la suma de las dos barras y su
    // hueco es el alto que hay que centrar, no el de una barra suelta.
    const textH = TITLE_H + TITLE_GAP + SUBTITLE_H;
    const textTop = top + (ROW_HEIGHT - textH) / 2;
    shapes.push({
      x: textX,
      y: textTop,
      width: Math.round(available * TITLE_RATIO),
      height: TITLE_H,
      radius: BAR_RADIUS,
    });
    shapes.push({
      x: textX,
      y: textTop + TITLE_H + TITLE_GAP,
      width: Math.round(available * SUBTITLE_RATIO),
      height: SUBTITLE_H,
      radius: BAR_RADIUS,
    });
  }

  return { shapes, height: rows * ROW_HEIGHT };
}

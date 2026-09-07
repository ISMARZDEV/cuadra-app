import { NAVBAR_CIRCLE, NAVBAR_VIEWBOX } from "./notched-glass";

/**
 * DÓNDE VIVE EL ORBE, en coordenadas de pantalla.
 *
 * Existe porque el orbe se dibuja en DOS sitios y tienen que coincidir al píxel:
 *
 *   1. Dentro de la barra de pestañas, que es quien recibe el dedo (`PanResponder`).
 *   2. Encima de la lente líquida, nítido, mientras se mantiene pulsado — porque el fondo entero
 *      (barra incluida) se esmerila y el control activo tiene que recortarse contra él, que es lo
 *      que hace la referencia de Monogram con su micrófono.
 *
 * ⚠️ **Con la cuenta duplicada en los dos sitios, el orbe de encima aparecería DESPLAZADO respecto
 * al que recibe el toque**, y sería un defecto invisible en el código y obvio en pantalla. Un
 * número compartido va en un módulo, nunca copiado con un comentario que diga «acuérdate» — ver
 * `cuadra-motion` §5.
 */
export function orbFrame(width: number, insetsBottom: number) {
  const barWidth = Math.min(width - 24, 380);
  const scale = barWidth / NAVBAR_VIEWBOX.width;
  const navHeight = NAVBAR_VIEWBOX.height * scale;
  /** Ancho del óvalo. El 1.35 lo desborda un poco de la muesca, a propósito. */
  const size = NAVBAR_CIRCLE.r * 2 * scale * 1.35;
  /** El orbe es un ÓVALO: alto = ancho × 0.86. */
  const height = size * 0.86;
  /** Centrado sobre la muesca, medido desde el techo de la composición de la barra. */
  const top = NAVBAR_CIRCLE.cy * scale - height / 2;
  /** El aire que la barra se deja contra el borde inferior de la pantalla. */
  const padBottom = Math.max((insetsBottom || 12) - 16, 6) + 14;

  return {
    size,
    height,
    top,
    navHeight,
    barWidth,
    scale,
    /** Distancia del canto INFERIOR de la pantalla al canto inferior del orbe. */
    bottom: padBottom + navHeight - top - height,
  };
}

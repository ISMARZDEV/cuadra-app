/**
 * El ORDEN DE CAPAS de la vertical Supermarket.
 *
 * Vive en un módulo por la misma razón que `product-palette.ts` y `product-type.ts`: son varios
 * archivos los que tienen que estar de acuerdo. Aquí eran SEIS —el header, la banda de desenfoque,
 * la tarjeta de la foto, el tirador, el velo y la hoja— repartidos por cuatro ficheros, cada uno
 * con su número escrito a mano y un comentario que nombraba a los otros de memoria.
 *
 * ⚠️ **Y ya se desincronizó.** El velo de «Elegir tienda» se declaró sin `zIndex` —o sea, en 0—
 * mientras cuatro piezas de la página llevaban el suyo. Al abrir la hoja, la página se atenuaba y
 * retrocedía pero esas cuatro se quedaban ENCIMA del velo, a tamaño completo y sin atenuar; la
 * foto, que es la pieza más grande de la pantalla, flotaba brillante sobre una página oscurecida.
 * Nadie escribió un número equivocado: es que nadie era DUEÑO del orden.
 *
 * Ver `layers.test.ts`, que impide que se repita: una capa nueva tiene que declararse en
 * `PAGE_LAYERS` o en `MODAL_LAYERS`, y eso la obliga a decir de qué lado del velo está.
 */
export const LAYER = {
  /** El scroll y todo lo que sube con él. La base contra la que se miden las demás. */
  content: 0,
  /** El desvanecido del canto superior: ENTRE el contenido y el verde, para seguir a la curva. */
  topFade: 1,
  /** La elipse verde. Tapa el contenido que sube por debajo. */
  header: 2,
  /** La tarjeta de la foto: la ÚNICA pieza que CRUZA el verde. */
  heroPhoto: 3,
  /** Controles posados sobre la página: el tirador de volver arriba, el botón de la canasta. */
  floatingControl: 4,
  /** El velo de una hoja modal. */
  veil: 10,
  /** La hoja en sí. */
  sheet: 11,
} as const;

/**
 * Las capas que son LA PÁGINA. Todas quedan por debajo del velo — eso es lo que significa que una
 * hoja sea modal.
 */
export const PAGE_LAYERS = [
  "content",
  "topFade",
  "header",
  "heroPhoto",
  "floatingControl",
] as const satisfies ReadonlyArray<keyof typeof LAYER>;

/**
 * Las capas que van POR ENCIMA de la página.
 *
 * ⭐ El salto de 4 a 10 es a propósito: deja sitio para que la página crezca sin que una pieza
 * nueva se cuele por encima del velo sólo porque el siguiente número libre estaba ahí.
 */
export const MODAL_LAYERS = ["veil", "sheet"] as const satisfies ReadonlyArray<keyof typeof LAYER>;

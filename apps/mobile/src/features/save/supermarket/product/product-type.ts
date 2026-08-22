// La escala tipográfica del detalle de producto, medida sobre el diseño de referencia.
//
// Vive en un módulo y no repartida por los componentes porque son SIETE archivos los que tienen que
// estar de acuerdo: si cada uno escribe su número, la pantalla acaba con cuatro tamaños de «título
// de sección» que nadie eligió y que sólo se notan al verlos juntos.
//
// Los valores salen de medir el mock a 1068 px de ancho y llevarlo a puntos (factor ~2,72).

/** Nombre del producto. Lo más grande de la pantalla — es de lo que trata todo. */
export const TITLE = 24;
/** Encabezado de sección: «Otras tiendas», «Idea de preparación», «Productos similares». */
export const SECTION = 20;
/** El precio grande. */
export const PRICE = 32;
/** Los céntimos volados y el símbolo. */
export const PRICE_CENTS = 16;
/** Enlace de acción de una sección («Ver tiendas», «Ver más»). */
export const ACTION = 15;
/** Nombre de una tienda en la comparativa. */
export const ROW_TITLE = 16;
/** Precio de una fila. */
export const ROW_PRICE = 17;
/** Texto secundario: marca, tamaño, «visto hace…», sobreprecio. */
export const META = 13;
/** Lo más pequeño que se permite. Por debajo deja de leerse en un teléfono. */
export const MICRO = 11;

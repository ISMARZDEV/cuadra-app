/**
 * Los colores de la cabecera del detalle, medidos sobre el mock de Figma (nodo 1037:13199).
 *
 * Viven en un módulo por la misma razón que `product-type.ts`: son varios archivos los que tienen
 * que estar de acuerdo, y si cada uno escribe su hex la pantalla acaba con tres verdes distintos
 * que nadie eligió y que sólo se notan al verlos juntos.
 *
 * ⚠️ Son hex LITERALES y no tokens del tema a propósito: esta cabecera es una superficie CLARA en
 * los dos temas —igual que la placa de la foto, y por el mismo motivo, que es que la marca manda
 * sobre el esquema del sistema aquí—. Donde sí hay que seguir al tema, se usa `dark:` como en el
 * resto de la app.
 */

/** Verde profundo de la marca: el título, el precio grande, el texto sobre lima. */
export const DEEP_GREEN = "#034842";
/** El lima de la marca. Botones, chips, el acento del ahorro. */
export const BRAND_LIME = "#C2FB7E";
/** Lima más saturado: la cifra del ahorro y el separador «X» del precio por unidad. */
export const LIME_INK = "#93D555";
/** El lima suave del «DOP» en la línea de identidad. */
export const LIME_SOFT = "#A6D56E";
/** Turquesa del precio por unidad y de los enlaces. */
export const TEAL = "#00A7BE";

/** Gris de la marca en la línea de identidad. */
export const META_INK = "#4F585D";
/** Gris del tamaño («2.0 Kg»). */
export const SIZE_INK = "#898989";
/** Gris del precio por unidad ANTERIOR. */
export const WAS_UNIT_INK = "#7E7C7C";

/** Rojo oscuro del precio anterior, el que va tachado. */
export const WAS_INK = "#480303";
/** Fondo del sello «ANTES». */
export const WAS_BADGE_BG = "#FF9797";
/** Tinta del sello «ANTES». */
export const WAS_BADGE_INK = "#680000";

/**
 * La sombra de la tarjeta de la foto, tal cual la da el diseño.
 *
 * ⚠️ Va como `boxShadow` y no como `shadowRadius`/`shadowOffset`, y no es capricho: el diseño pide
 * un SPREAD negativo (`-7px`) que encoge la sombra, y las props clásicas de iOS no tienen spread.
 * `boxShadow` existe en React Native desde la 0.76 y acepta la forma CSS entera, así que el número
 * del diseño entra sin traducción — que es justo lo que evita que se desincronicen.
 */
export const CARD_SHADOW = "0px 4px 30.6px -10px rgba(0, 0, 0, 0.10)";
/** El canto del cuadro claro sobre la franja de Cuadra: hoy, «seguir el precio». */
export const CHIP_EDGE = "#E6E6E6";

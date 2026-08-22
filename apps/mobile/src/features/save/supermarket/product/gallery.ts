/**
 * Las reglas de la galería de fotos del producto.
 *
 * Viven en un módulo puro y no dentro del componente porque cada una nació de una pregunta con dos
 * respuestas defendibles —¿qué pasa con un producto sin foto? ¿y con una sola? ¿y si dos tiendas
 * sirven la misma imagen?— y una respuesta que sólo existe dentro de un `useState` no se puede leer
 * ni discutir.
 */

/**
 * Qué fotos se pintan, en orden.
 *
 * ⭐ El backend ya la devuelve ordenada por `position` y garantiza que la primera es la imagen
 * pública (`image_url`). Aquí NO se reordena: dos sitios ordenando lo mismo es exactamente cómo
 * acaban discrepando, y el síntoma sería que el carrusel abre en una foto distinta de la que el
 * usuario acaba de tocar en la rejilla.
 *
 * @param gallery La galería del API. `undefined` en un cliente viejo o antes del backfill.
 * @param primary La imagen pública, que es el plan B.
 */
export function galleryOf(
  gallery: string[] | undefined,
  primary: string | null | undefined,
): string[] {
  const source = gallery && gallery.length > 0 ? gallery : primary ? [primary] : [];
  // ⭐ Las repetidas se colapsan, y pasa DE VERDAD: la galería se llena con las fotos de las tiendas
  // emparejadas, y dos tiendas que venden el mismo producto suelen servir la misma imagen del
  // fabricante. Sin esto el usuario desliza, no cambia nada, y lo lee como que está roto.
  return [...new Set(source.filter((url): url is string => Boolean(url)))];
}

/**
 * Si hay carrusel que enseñar.
 *
 * ⭐ Con una sola foto NO lo hay, y es una decisión, no un descuido: flechas que no llevan a ningún
 * sitio y un único punto se parecen al diseño en una captura y mienten en la mano del usuario.
 */
export function hasCarousel(count: number): boolean {
  return count > 1;
}

/**
 * En qué foto estamos, a partir del desplazamiento horizontal.
 *
 * ⭐ Se DERIVA del scroll en vez de guardarse aparte, y eso es lo que hace que el punto y la foto no
 * puedan discrepar: no hay dos fuentes que se desincronicen a mitad de un deslizamiento
 * interrumpido.
 */
export function pageAt(offsetX: number, pageWidth: number, count: number): number {
  "worklet";
  // El primer render ocurre ANTES del `onLayout`, así que el ancho puede ser 0: dividir daría `NaN`
  // y el carrusel entero se quedaría en blanco.
  if (pageWidth <= 0 || count <= 0) return 0;
  // Redondear —y no truncar— es lo que hace que el punto salte al pasar la MITAD, que es cuando el
  // ojo ya da por llegada la siguiente foto. Truncando, el punto se queda atrás hasta el final.
  const page = Math.round(offsetX / pageWidth);
  // iOS deja arrastrar más allá de los extremos: sin acotar, el índice se iría fuera del array y no
  // se encendería ningún punto.
  return page < 0 ? 0 : page > count - 1 ? count - 1 : page;
}

/**
 * A dónde lleva una flecha.
 *
 * ⭐ **Sin ciclo a propósito.** El carrusel tiene un principio y un final que los puntos están
 * enseñando; saltar del último al primero contradice lo que el usuario acaba de leer ahí abajo.
 */
export function stepPage(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const next = current + delta;
  return next < 0 ? 0 : next > count - 1 ? count - 1 : next;
}

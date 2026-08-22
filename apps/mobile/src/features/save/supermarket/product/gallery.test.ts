import { describe, expect, test } from "vitest";

import { galleryOf, hasCarousel, pageAt, stepPage } from "./gallery";

/**
 * La galería de fotos del producto.
 *
 * Las reglas viven en un módulo puro y no dentro del componente porque cada una nació de una
 * pregunta con dos respuestas defendibles —¿qué pasa con un producto sin foto? ¿y con una sola?—
 * y una respuesta que sólo existe dentro de un `useState` no se puede leer ni discutir.
 */

describe("qué fotos se pintan", () => {
  test("la galería del API manda, y llega ya ordenada por posición", () => {
    // El backend la ordena por `position` y garantiza que la primera es la imagen pública. Aquí no
    // se reordena: dos sitios ordenando lo mismo es cómo acaban discrepando.
    expect(galleryOf(["a.jpg", "b.jpg", "c.jpg"], "a.jpg")).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  test("sin galería cae a la imagen pública sola", () => {
    // Un cliente viejo, o un producto que el backfill todavía no tocó. Se degrada a lo que había
    // antes: una foto. Nunca a una pantalla vacía.
    expect(galleryOf(undefined, "a.jpg")).toEqual(["a.jpg"]);
    expect(galleryOf([], "a.jpg")).toEqual(["a.jpg"]);
  });

  test("sin ninguna foto la lista queda VACÍA, no con un hueco dentro", () => {
    // ⭐ Un `[null]` se pintaría como una diapositiva en blanco CON SU PUNTITO, prometiendo una
    // imagen que no existe. Vacía, el componente sabe que tiene que dibujar el marcador de posición.
    expect(galleryOf(undefined, null)).toEqual([]);
    expect(galleryOf([], undefined)).toEqual([]);
  });

  test("las URLs repetidas se colapsan", () => {
    // ⭐ Pasa de verdad: la galería se llena con las fotos de las tiendas emparejadas, y dos tiendas
    // que venden el mismo producto suelen servir la MISMA imagen del fabricante. Sin esto, el
    // usuario desliza y no cambia nada — que se lee como que el carrusel está roto.
    expect(galleryOf(["a.jpg", "b.jpg", "a.jpg"], "a.jpg")).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("cuándo hay carrusel", () => {
  test("con una sola foto NO lo hay", () => {
    // ⭐ Flechas que no llevan a ningún sitio y un único punto: se parece al mock en una captura y
    // miente en la mano del usuario. Un carrusel de uno es peor que no tener carrusel.
    expect(hasCarousel(0)).toBe(false);
    expect(hasCarousel(1)).toBe(false);
  });

  test("desde dos, sí", () => {
    expect(hasCarousel(2)).toBe(true);
    expect(hasCarousel(3)).toBe(true);
  });
});

describe("en qué foto estoy", () => {
  const ANCHO = 300;

  test("el punto activo sale del desplazamiento, no de un estado aparte", () => {
    // Derivarlo del scroll es lo que hace que el punto y la foto NUNCA discrepen: no hay dos
    // fuentes que puedan desincronizarse a mitad de un deslizamiento interrumpido.
    expect(pageAt(0, ANCHO, 3)).toBe(0);
    expect(pageAt(ANCHO, ANCHO, 3)).toBe(1);
    expect(pageAt(ANCHO * 2, ANCHO, 3)).toBe(2);
  });

  test("a mitad de camino todavía manda la foto de la que vienes", () => {
    // El punto salta al pasar la MITAD, que es cuando el ojo ya considera que llegó la siguiente.
    // Saltando antes, el punto se adelanta al dedo y parece que va solo.
    expect(pageAt(ANCHO * 0.4, ANCHO, 3)).toBe(0);
    expect(pageAt(ANCHO * 0.6, ANCHO, 3)).toBe(1);
  });

  test("el rebote de los extremos no se sale de la lista", () => {
    // iOS deja arrastrar más allá del final: sin acotar, el punto activo se iría fuera del array y
    // no se encendería ninguno.
    expect(pageAt(-200, ANCHO, 3)).toBe(0);
    expect(pageAt(ANCHO * 99, ANCHO, 3)).toBe(2);
  });

  test("con un ancho todavía sin medir no revienta", () => {
    // El primer render ocurre ANTES del `onLayout`: dividir por 0 daría `NaN` y el carrusel entero
    // se quedaría en blanco.
    expect(pageAt(0, 0, 3)).toBe(0);
  });
});

describe("las flechas", () => {
  test("avanzan y retroceden de una en una", () => {
    expect(stepPage(0, 1, 3)).toBe(1);
    expect(stepPage(2, -1, 3)).toBe(1);
  });

  test("y NO dan la vuelta al llegar al final", () => {
    // ⭐ Sin ciclo a propósito: el carrusel tiene un principio y un final visibles en los puntos, y
    // saltar del último al primero contradice lo que los puntos acaban de decir.
    expect(stepPage(2, 1, 3)).toBe(2);
    expect(stepPage(0, -1, 3)).toBe(0);
  });

  test("con la lista vacía no hay a dónde ir", () => {
    expect(stepPage(0, 1, 0)).toBe(0);
  });
});

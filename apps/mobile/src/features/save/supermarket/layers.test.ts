import { describe, expect, test } from "vitest";

import { LAYER, MODAL_LAYERS, PAGE_LAYERS } from "./layers";

describe("el orden de capas de Supermarket", () => {
  test("EL DEFECTO: el velo tapa TODAS las capas de la página", () => {
    // Éste es el fallo que originó el módulo. El velo de «Elegir tienda» se declaraba sin `zIndex`
    // —es decir, en 0— mientras cuatro piezas de la página llevaban el suyo: la banda de
    // desenfoque (1), el header (2), la tarjeta de la foto (3) y el tirador (4). Resultado: al
    // abrir la hoja la página se atenuaba y retrocedía, pero esas cuatro se quedaban ENCIMA del
    // velo, a tamaño completo y sin atenuar. La foto, que es la pieza más grande de la pantalla,
    // flotaba brillante sobre una página oscurecida.
    for (const name of PAGE_LAYERS) {
      expect(LAYER[name], `«${name}» debe quedar por DEBAJO del velo`).toBeLessThan(LAYER.veil);
    }
  });

  test("la hoja va por encima del velo, que es lo que la hace legible", () => {
    expect(LAYER.sheet).toBeGreaterThan(LAYER.veil);
  });

  test("ninguna capa puede quedar sin clasificar", () => {
    // ⭐ La guardia de verdad. El defecto no fue elegir mal un número: fue que NADIE era dueño del
    // orden, así que una pieza nueva podía nacer sin que nadie la comparase con el velo. Aquí una
    // capa nueva obliga a decir de qué lado del velo está, o el test se cae.
    const clasificadas = new Set<string>([...PAGE_LAYERS, ...MODAL_LAYERS]);
    const sinClasificar = Object.keys(LAYER).filter((k) => !clasificadas.has(k));

    expect(sinClasificar, "clasifícala en PAGE_LAYERS o en MODAL_LAYERS").toEqual([]);
  });

  test("el verde tapa el contenido que sube, pero NO la tarjeta de la foto", () => {
    // La foto es la ÚNICA pieza que cruza la elipse verde; todo lo demás pasa por debajo.
    expect(LAYER.content).toBeLessThan(LAYER.header);
    expect(LAYER.heroPhoto).toBeGreaterThan(LAYER.header);
  });

  test("la banda de desenfoque va ENTRE el contenido y el verde", () => {
    // Así el verde tapa el tramo de banda que le toca y el desenfoque SIGUE A LA CURVA sin
    // dibujarla. Por encima del verde se vería la nube pintada sobre la elipse.
    expect(LAYER.topFade).toBeGreaterThan(LAYER.content);
    expect(LAYER.topFade).toBeLessThan(LAYER.header);
  });

  test("los controles flotantes quedan por encima de la foto", () => {
    // El tirador de volver arriba se posa en el canto de la elipse y la foto lo cruza al plegarse:
    // por debajo, la foto se lo comería justo cuando hace falta.
    expect(LAYER.floatingControl).toBeGreaterThan(LAYER.heroPhoto);
  });
});

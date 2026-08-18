import { describe, expect, test } from "vitest";

import { headerBlockHeight } from "./arc-geometry";
import { homeSearchBarY, resolveSearchAnchor } from "./search-anchor";

// Anchos reales, para que los números de abajo signifiquen algo.
const IPHONE_12 = 390;
/** Donde se posa la barra abierta: área segura + 8. Ver `restY` en `search-overlay`. */
const REST_Y = 47 + 8;
/** El suelo del recorrido. Ver `MIN_TRAVEL` en `search-overlay`. */
const MIN_TRAVEL = 56;

describe("el ancla del buscador de la home", () => {
  test("sin desplazar, nace justo donde termina el bloque del header", () => {
    expect(homeSearchBarY({ width: IPHONE_12, scrollY: 0 })).toBe(headerBlockHeight(IPHONE_12));
  });

  test("al desplazar la home, sube exactamente lo desplazado", () => {
    const quieta = homeSearchBarY({ width: IPHONE_12, scrollY: 0 });

    expect(homeSearchBarY({ width: IPHONE_12, scrollY: 120 })).toBe(quieta - 120);
  });

  test("EL DEFECTO: sin medida nativa el recorrido sigue siendo el de verdad, no el suelo", () => {
    // Ésta es la aserción que importa. En frío `measureInWindow` devuelve 0 y no hay medida
    // guardada; con la geometría, el primer toque tiene una posición TAN BUENA como el segundo.
    const fromY = homeSearchBarY({ width: IPHONE_12, scrollY: 0 });

    const travel = Math.max(MIN_TRAVEL, fromY - REST_Y);

    // Si esto cayera al suelo, la barra nacería a 56px de arriba: el destello que se reportó.
    expect(travel).toBeGreaterThan(MIN_TRAVEL * 3);
  });

  test("la píldora vive bien abajo en cualquier teléfono, nunca pegada al notch", () => {
    for (const width of [375, 390, 402, 430]) {
      expect(homeSearchBarY({ width, scrollY: 0 })).toBeGreaterThan(REST_Y + MIN_TRAVEL);
    }
  });
});

describe("de dónde sale el fromY que recibe la hoja", () => {
  const HOME = { width: IPHONE_12, scrollY: 0 };

  test("manda la medida nativa cuando llega, porque es la verdad del momento", () => {
    // La geometría no sabe de cambios de maquetación; la medida sí. Si existe, gana.
    expect(resolveSearchAnchor({ measured: 431, ...HOME })).toBe(431);
  });

  test("EL DEFECTO: sin medida NO se devuelve nada aproximado — se devuelve la geometría", () => {
    // Antes, `undefined` hacía que la pantalla NO actualizara `searchY`, que en frío vale 0. De ahí
    // salía el recorrido de 56px y la barra nacía bajo el notch.
    expect(resolveSearchAnchor({ measured: undefined, ...HOME })).toBe(
      homeSearchBarY(HOME),
    );
  });

  test("una medida increíble se descarta igual que si no hubiera llegado", () => {
    // `measureInWindow` en frío devuelve 0 en vez de fallar. Un 0 no es una posición: es un fallo
    // con disfraz, y tratarlo como dato es lo que ponía la barra arriba.
    expect(resolveSearchAnchor({ measured: 0, ...HOME })).toBe(homeSearchBarY(HOME));
  });

  test("con la home desplazada, la geometría sigue el desplazamiento", () => {
    expect(resolveSearchAnchor({ measured: undefined, width: IPHONE_12, scrollY: 90 })).toBe(
      homeSearchBarY({ width: IPHONE_12, scrollY: 90 }),
    );
  });
});

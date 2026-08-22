import { describe, expect, test } from "vitest";

import { isRevealTap, TAP_SLOP } from "./reveal-tap";

describe("isRevealTap", () => {
  test("un dedo que se posa y levanta en el sitio ES un toque", () => {
    expect(isRevealTap({ dx: 0, dy: 0 })).toBe(true);
  });

  test("un temblor pequeño sigue siendo un toque", () => {
    // Nadie levanta el dedo exactamente donde lo puso. Sin holgura, «tocar» sería imposible.
    expect(isRevealTap({ dx: 3, dy: 4 })).toBe(true);
  });

  test("arrastrar NO es tocar, aunque acabe cerca", () => {
    expect(isRevealTap({ dx: 0, dy: TAP_SLOP + 1 })).toBe(false);
  });

  test("la dirección no importa: se mide la DISTANCIA", () => {
    // Arrastrar hacia arriba tampoco revela. Lo que revela es tocar, no moverse — si bastara con
    // subir, la barra reaparecería sola en cuanto el scroll rebotara.
    expect(isRevealTap({ dx: 0, dy: -(TAP_SLOP + 1) })).toBe(false);
    expect(isRevealTap({ dx: TAP_SLOP + 1, dy: 0 })).toBe(false);
  });

  test("la holgura es un CÍRCULO, no una caja", () => {
    // 8 y 8 por separado caben en la holgura, pero juntos suman 11.3 de recorrido real. Medir por
    // ejes dejaría pasar como «toque» un arrastre en diagonal de más de la cuenta.
    expect(isRevealTap({ dx: 8, dy: 8 })).toBe(false);
  });
});

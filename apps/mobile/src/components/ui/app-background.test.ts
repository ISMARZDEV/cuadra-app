import { describe, expect, test } from "vitest";

import { appBgColorAt } from "./app-background";

// El fondo de la app es un DEGRADADO vertical, así que «el color del fondo» no existe: existe el
// color del fondo A UNA ALTURA. Cualquier superficie que quiera confundirse con él tiene que
// preguntárselo en vez de inventárselo — medido, una banda `#0B0B0B` puesta a ojo sobre un fondo
// que ahí vale `#010606` se ve como un rectángulo gris, y además con el matiz cambiado (el fondo
// tira a teal, el parche era gris neutro).
describe("el color del fondo a una altura", () => {
  test("arriba del todo es el primer tope del degradado", () => {
    expect(appBgColorAt("dark", 0)).toBe("#000000");
  });

  test("abajo del todo es el segundo tope", () => {
    expect(appBgColorAt("dark", 1)).toBe("#041010");
  });

  test("a media altura interpola canal a canal", () => {
    // #000000 → #041010 a la mitad: r=2, g=8, b=8.
    expect(appBgColorAt("dark", 0.5)).toBe("#020808");
  });

  test("en claro el degradado es plano, así que da lo mismo la altura", () => {
    expect(appBgColorAt("light", 0)).toBe("#FFFFFF");
    expect(appBgColorAt("light", 0.37)).toBe("#FFFFFF");
    expect(appBgColorAt("light", 1)).toBe("#FFFFFF");
  });

  // Una pantalla puede preguntar por una altura fuera de rango sin querer: una banda que se desplaza
  // hacia arriba al plegarse llega a pedir una fracción negativa. Devolver un color roto (o `NaN`)
  // pintaría un agujero — el degradado simplemente se acaba en sus topes.
  test("fuera de rango se queda en los topes en vez de romperse", () => {
    expect(appBgColorAt("dark", -0.5)).toBe("#000000");
    expect(appBgColorAt("dark", 2)).toBe("#041010");
  });
});

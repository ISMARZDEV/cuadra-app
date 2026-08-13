import { describe, expect, test } from "vitest";

import { exceedsLines } from "./use-is-truncated";

// Sólo la COMPARACIÓN se prueba acá — la medición en sí es inalcanzable bajo jsdom
// (`node.offsetHeight` siempre 0; ver el aviso en use-is-truncated.tsx). Aislarla en una función
// pura es lo que salva algo de esta lógica de ser 100% "verificable sólo en device".
//
// Con `lineHeight` 18 y 2 líneas permitidas: 1 línea ≈ 18, 2 ≈ 36, 3 ≈ 54. El umbral cae en 45.
const LINE = 18;
const MAX_LINES = 2;

describe("exceedsLines", () => {
  test("a label that needs three lines is truncated", () => {
    expect(exceedsLines(54, LINE, MAX_LINES)).toBe(true);
  });

  test("a label of exactly two lines is NOT truncated — it fits", () => {
    expect(exceedsLines(36, LINE, MAX_LINES)).toBe(false);
  });

  test("a one-line label is not truncated either", () => {
    expect(exceedsLines(18, LINE, MAX_LINES)).toBe(false);
  });

  // La tolerancia de media línea existe para esto: el alto medido nunca cae exacto en 36 (redondeo
  // sub-pixel, métricas de la fuente), y sin ella un texto de dos líneas justas se declararía
  // truncado por medio punto — el `…` aparecería sobre un texto que se ve entero.
  test("two lines plus sub-pixel rounding still fits", () => {
    expect(exceedsLines(37.5, LINE, MAX_LINES)).toBe(false);
  });

  // Antes de medir se asume NO truncado: falla del lado de no ofrecer un gesto de más, nunca al
  // revés (un popover que promete revelar algo y muestra el mismo texto es peor que nada).
  test("before the measurement lands, nothing is considered truncated", () => {
    expect(exceedsLines(null, LINE, MAX_LINES)).toBe(false);
  });
});

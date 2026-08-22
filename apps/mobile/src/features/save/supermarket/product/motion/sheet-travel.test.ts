import { describe, expect, test } from "vitest";

import { closedOffset } from "./sheet-travel";

describe("closedOffset", () => {
  test("una vez medida, la hoja se esconde exactamente su alto", () => {
    expect(closedOffset(420, 900)).toBe(420);
  });

  test("SIN medir todavía, se esconde el viewport entero", () => {
    // EL DEFECTO: `onLayout` corre DESPUÉS del primer pintado. Con 0 como alto, la hoja cerrada
    // tiene translateY 0 — es decir, aparece ENTERA encima de la pantalla durante el fotograma de
    // montaje y desaparece al medirse. La ficha del patrón avisaba de este caso; su código no lo
    // resolvía. El viewport siempre es ≥ que la hoja, así que sirve de escondite seguro.
    expect(closedOffset(0, 900)).toBe(900);
  });

  test("una medida absurda no deja la hoja a medio salir", () => {
    // Alturas negativas o NaN llegan de layouts intermedios; ninguna puede traducirse en «visible».
    expect(closedOffset(-5, 900)).toBe(900);
    expect(closedOffset(Number.NaN, 900)).toBe(900);
  });

  test("una hoja más alta que el viewport se esconde su propio alto, no el del viewport", () => {
    // Si no, asomaría por abajo la diferencia.
    expect(closedOffset(1200, 900)).toBe(1200);
  });
});

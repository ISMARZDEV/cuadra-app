import { describe, expect, it } from "vitest";

import { formatUnitPriceDisplay } from "./format";

describe("formatUnitPriceDisplay — productos sin tamaño", () => {
  // No todo producto declara tamaño. Sin cantidad no hay precio por unidad base que mostrar, y
  // fabricar uno (o imprimir "RD$0.00/und") mentiría sobre un dato que no existe.
  it("devuelve vacío cuando no hay precio por unidad", () => {
    expect(formatUnitPriceDisplay(12500, "DOP", null, null, null)).toBe("");
  });

  it("sigue usando el display_size cuando SÍ lo hay, aunque falte el unitario", () => {
    // El tamaño de empaque es una fuente independiente: si está, se usa.
    expect(formatUnitPriceDisplay(20000, "DOP", "10 Lb", null, null)).toContain("/Lb");
  });
});

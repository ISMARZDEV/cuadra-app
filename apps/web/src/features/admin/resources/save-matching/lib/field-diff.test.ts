import { describe, expect, it } from "vitest";

import { canonicalUnit, diffField, diffSize, formatSize } from "./field-diff";

describe("diffField", () => {
  it("match exacto", () => {
    expect(diffField("Rica", "Rica")).toBe("match");
  });

  it("match insensible a mayúsculas/minúsculas", () => {
    expect(diffField("Rica", "rica")).toBe("match");
    expect(diffField("RICA", "rica")).toBe("match");
  });

  it("match insensible a espacios (trim)", () => {
    expect(diffField("Rica", "rica ")).toBe("match");
    expect(diffField(" Rica ", "Rica")).toBe("match");
  });

  it("difieren genuinamente", () => {
    expect(diffField("Rica", "La Fina")).toBe("differ");
  });

  it("null vs valor → differ", () => {
    expect(diffField(null, "Rica")).toBe("differ");
    expect(diffField("Rica", null)).toBe("differ");
  });

  it("null vs null → match (ambos ausentes = coinciden)", () => {
    expect(diffField(null, null)).toBe("match");
  });

  it("string vacío vs null → match (ambos se tratan como ausentes)", () => {
    expect(diffField("", null)).toBe("match");
    expect(diffField(null, "")).toBe("match");
  });

  it("string vacío vs string vacío/whitespace → match", () => {
    expect(diffField("", "")).toBe("match");
    expect(diffField("  ", "")).toBe("match");
  });

  it("string vacío vs valor real → differ", () => {
    expect(diffField("", "Rica")).toBe("differ");
  });
});

describe("canonicalUnit (token de 2 letras)", () => {
  it("normaliza variantes a su token de 2 letras", () => {
    expect(canonicalUnit("Lbs")).toBe("Lb");
    expect(canonicalUnit("LB")).toBe("Lb");
    expect(canonicalUnit("libras")).toBe("Lb");
    expect(canonicalUnit("gramos")).toBe("Gr");
    expect(canonicalUnit("g")).toBe("Gr");
    expect(canonicalUnit("onzas")).toBe("Oz");
    expect(canonicalUnit("litros")).toBe("Lt");
    expect(canonicalUnit("ml")).toBe("Ml");
  });
});

describe("diffSize (compara cantidad + unidad canónica, no texto crudo)", () => {
  it("misma cantidad y unidad equivalente → match (no más '20 Lbs ≠ 20 LB')", () => {
    expect(diffSize("20 Lbs", "20 LB")).toBe("match");
    expect(diffSize("24 Oz", "24 onzas")).toBe("match");
    expect(diffSize("500 gramos", "500 Gr")).toBe("match");
    expect(diffSize("2.0 Kg", "2 Kg")).toBe("match");
  });

  it("cantidad distinta → differ", () => {
    expect(diffSize("5 Lb", "10 Lb")).toBe("differ");
  });

  it("unidad de familia distinta → differ", () => {
    expect(diffSize("1 Kg", "1 Lb")).toBe("differ");
  });

  it("ausentes → match; valor vs ausente → differ", () => {
    expect(diffSize(null, null)).toBe("match");
    expect(diffSize("20 Lb", null)).toBe("differ");
  });
});

describe("formatSize (display con token de 2 letras)", () => {
  it("normaliza el tamaño a 'cantidad + unidad de 2 letras'", () => {
    expect(formatSize("20 Lbs")).toBe("20 Lb");
    expect(formatSize("500 gramos")).toBe("500 Gr");
  });
  it("descriptores de talla → 1 letra (Grande=G, Mediana=M, Pequeña=P)", () => {
    expect(formatSize("Grande")).toBe("G");
    expect(formatSize("mediana")).toBe("M");
    expect(formatSize("Pequeña")).toBe("P");
  });
  it("desconocido → texto tal cual; vacío → —", () => {
    expect(formatSize("XYZ")).toBe("XYZ");
    expect(formatSize(null)).toBe("—");
  });
});

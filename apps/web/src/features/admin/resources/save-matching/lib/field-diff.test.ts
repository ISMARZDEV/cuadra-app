import { describe, expect, it } from "vitest";

import { diffField } from "./field-diff";

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

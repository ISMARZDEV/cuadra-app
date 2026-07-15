import { describe, expect, it } from "vitest";

import { DEFAULT_SORT, DEFAULT_VIEW_MODE, parseSort, parseViewMode } from "./enums";

describe("parseSort", () => {
  it("acepta un sort válido de la URL", () => {
    expect(parseSort("unit_price")).toBe("unit_price");
  });
  it("cae al default con basura o ausente", () => {
    expect(parseSort("basura")).toBe(DEFAULT_SORT);
    expect(parseSort(undefined)).toBe(DEFAULT_SORT);
  });
});

describe("parseViewMode", () => {
  it("solo 'pages' es pages; el resto es el default (loadmore)", () => {
    expect(parseViewMode("pages")).toBe("pages");
    expect(parseViewMode("loadmore")).toBe(DEFAULT_VIEW_MODE);
    expect(parseViewMode(undefined)).toBe(DEFAULT_VIEW_MODE);
  });
});

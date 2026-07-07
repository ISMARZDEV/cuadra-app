import { describe, expect, it } from "vitest";

import { confidenceColor } from "./confidence-color";

describe("confidenceColor", () => {
  it("banda HIGH (>= 0.85) → estilo más oscuro/seguro", () => {
    expect(confidenceColor(0.85)).toBe("bg-emerald-700 text-white");
    expect(confidenceColor(0.9)).toBe("bg-emerald-700 text-white");
    expect(confidenceColor(1)).toBe("bg-emerald-700 text-white");
  });

  it("banda GREY [0.55, 0.85) → estilo intermedio", () => {
    expect(confidenceColor(0.55)).toBe("bg-amber-500 text-white");
    expect(confidenceColor(0.7)).toBe("bg-amber-500 text-white");
    expect(confidenceColor(0.849)).toBe("bg-amber-500 text-white");
  });

  it("banda HUMAN (< 0.55) → estilo más claro/necesita ojo", () => {
    expect(confidenceColor(0.549)).toBe("bg-rose-100 text-rose-900");
    expect(confidenceColor(0.3)).toBe("bg-rose-100 text-rose-900");
    expect(confidenceColor(0)).toBe("bg-rose-100 text-rose-900");
  });

  it("null/undefined (candidatos vacíos) → misma banda que baja confianza", () => {
    expect(confidenceColor(null)).toBe("bg-rose-100 text-rose-900");
  });
});

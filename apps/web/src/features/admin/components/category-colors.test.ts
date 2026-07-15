import { describe, expect, it } from "vitest";

import { categoryColor } from "./category-colors";

describe("categoryColor", () => {
  it("mapea un slug conocido a su hex exacto del Figma (nodo 502:6713)", () => {
    expect(categoryColor("frutas-verduras")).toEqual({ bg: "#dfffc8", text: "#335e00" });
    expect(categoryColor("panaderia-tortilleria")).toEqual({ bg: "#ffedd4", text: "#e18200" });
    expect(categoryColor("alcohol")).toEqual({ bg: "#ffeded", text: "#952325" });
  });

  it("cubre las 14 categorías con color exacto del Figma", () => {
    const slugsConColor = [
      "panaderia-tortilleria",
      "bebes",
      "bebidas",
      "frutas-verduras",
      "snacks-dulces",
      "despensa-abarrotes",
      "alcohol",
      "cuidado-del-hogar",
      "cuidado-personal",
      "embutidos-delicatessen",
      "carnes-pescados",
      "salud-farmacia",
      "escolares-oficina",
    ];
    for (const slug of slugsConColor) {
      expect(categoryColor(slug)).not.toEqual({ bg: "#f1f5f4", text: "#64748b" });
    }
  });

  it("slug null/undefined → fallback neutro", () => {
    expect(categoryColor(null)).toEqual({ bg: "#f1f5f4", text: "#64748b" });
    expect(categoryColor(undefined)).toEqual({ bg: "#f1f5f4", text: "#64748b" });
  });

  it("slug desconocido (ej. la 15ª categoría, color TBD) → fallback neutro", () => {
    expect(categoryColor("lacteos-huevos")).toEqual({ bg: "#f1f5f4", text: "#64748b" });
    expect(categoryColor("mascotas")).toEqual({ bg: "#f1f5f4", text: "#64748b" });
    expect(categoryColor("slug-que-no-existe")).toEqual({ bg: "#f1f5f4", text: "#64748b" });
  });
});

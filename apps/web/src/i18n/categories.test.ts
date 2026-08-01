import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LOCALES } from "./config";
import { CATEGORY_LABELS, categoryLabel } from "./categories";

// El markdown es la FUENTE DE VERDAD del árbol (lo lee `seeds/save_taxonomy_seed.py`). Este test
// ata el bundle a esa fuente: si alguien agrega una subcategoría allá y se olvida de traducirla
// acá, falla el build en vez de aparecer en español dentro de la app en inglés.
const MD = join(
  process.cwd(),
  "../../docs/research/save-fable/Categorias_y_Subcategorias.md",
);

function keysFromMarkdown(): string[] {
  const text = readFileSync(MD, "utf-8");
  const keys: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(">")) continue; // el header normativo del documento
    const match = /^(?:##\s|-)\s*.+?\s+`([a-z0-9][a-z0-9.-]*)`$/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

describe("bundle de categorías", () => {
  const expected = keysFromMarkdown();

  it("el markdown aporta las 150 keys del árbol", () => {
    expect(expected.length).toBe(150);
  });

  it.each(LOCALES)("%s cubre exactamente las keys del markdown", (locale) => {
    const present = new Set(Object.keys(CATEGORY_LABELS[locale]));
    const missing = expected.filter((k) => !present.has(k));
    const extra = [...present].filter((k) => !expected.includes(k));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("ninguna etiqueta queda vacía", () => {
    for (const locale of LOCALES) {
      for (const [key, label] of Object.entries(CATEGORY_LABELS[locale])) {
        expect(label.trim(), `${locale}/${key}`).not.toBe("");
      }
    }
  });
});

describe("categoryLabel", () => {
  it("traduce por key", () => {
    expect(categoryLabel("lacteos-huevos", "Lácteos & Huevos", "en")).toBe("Dairy & Eggs");
    expect(categoryLabel("lacteos-huevos", "Lácteos & Huevos", "pt")).toBe("Laticínios & Ovos");
  });

  it("sin key usa el nombre del catálogo", () => {
    // Los nodos de nivel ≥2 no vienen del markdown y no tienen key.
    expect(categoryLabel(null, "Arroz Blanco", "en")).toBe("Arroz Blanco");
    expect(categoryLabel(undefined, "Arroz Blanco", "en")).toBe("Arroz Blanco");
  });

  it("una key desconocida cae al nombre del catálogo en vez de romper", () => {
    expect(categoryLabel("no.existe", "Categoría Nueva", "en")).toBe("Categoría Nueva");
  });

  it("una key sin traducir en ese idioma cae al español, no al vacío", () => {
    // Simula el hueco: el fallback intermedio evita mostrar la key cruda al usuario.
    expect(categoryLabel("congelados.helados", "Helados", "es")).toBe("Helados");
  });
});

import { describe, expect, test } from "vitest";

import { buildTabs, filterByQuery, isListTab } from "./browse-state";

const cat = (slug: string, name: string) => ({ slug, name });
const prod = (name: string, brand = "Marca") =>
  ({ id: name, name, brand }) as Parameters<typeof filterByQuery>[0][number];

const LABELS = { deals: "Ofertas", featured: "Productos" };

// Las dos listas transversales van SIEMPRE por delante del árbol. Un producto en oferta sigue
// siendo lácteo, así que «ofertas» no es una categoría — es otra forma de cortar el mismo catálogo.
describe("las pestañas", () => {
  test("las dos listas van primero, en orden", () => {
    const tabs = buildTabs(LABELS, [cat("lacteos", "Lácteos")]);

    expect(tabs.slice(0, 2)).toEqual([
      { slug: "deals", name: "Ofertas" },
      { slug: "featured", name: "Productos" },
    ]);
  });

  test("detrás van las categorías en su orden", () => {
    const tabs = buildTabs(LABELS, [cat("lacteos", "Lácteos"), cat("carnes", "Carnes")]);

    expect(tabs.slice(2)).toEqual([
      { slug: "lacteos", name: "Lácteos" },
      { slug: "carnes", name: "Carnes" },
    ]);
  });

  // Si el árbol todavía no llegó (o falla), las listas siguen estando: la pantalla es útil sin
  // categorías, y quedarse sin ninguna pestaña se leería como que algo se rompió.
  test("sin categorías quedan las dos listas", () => {
    expect(buildTabs(LABELS, [])).toHaveLength(2);
  });

  // Lo que decide si la rejilla pide `/category/{slug}/products` o usa la lista ya cargada.
  test("distingue una lista de una categoría", () => {
    expect(isListTab("deals")).toBe(true);
    expect(isListTab("featured")).toBe(true);
    expect(isListTab("lacteos")).toBe(false);
  });
});

// El buscador filtra lo que YA está en pantalla; no consulta al servidor. Ver `search-bar`.
describe("el buscador", () => {
  const products = [prod("Arroz Selecto"), prod("Leche Rica"), prod("Habichuela Negra")];

  test("sin texto no filtra nada", () => {
    expect(filterByQuery(products, "")).toHaveLength(3);
    expect(filterByQuery(products, "   ")).toHaveLength(3);
  });

  test("encuentra por parte del nombre", () => {
    expect(filterByQuery(products, "arroz").map((p) => p.name)).toEqual(["Arroz Selecto"]);
  });

  // Nadie escribe con mayúsculas ni tildes en un buscador de súper. Que «habichuela» no encuentre
  // «Habichuela» sería un defecto, no una búsqueda estricta.
  test("ignora mayúsculas y tildes", () => {
    expect(filterByQuery([prod("Melocotón")], "melocoton")).toHaveLength(1);
    expect(filterByQuery([prod("Melocotón")], "MELOCOTÓN")).toHaveLength(1);
  });

  test("también busca por marca", () => {
    expect(filterByQuery([prod("Leche", "Rica")], "rica")).toHaveLength(1);
  });

  test("sin coincidencias devuelve vacío, no todo", () => {
    expect(filterByQuery(products, "zzz")).toEqual([]);
  });
});

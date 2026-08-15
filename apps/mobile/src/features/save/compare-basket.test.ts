import { beforeEach, describe, expect, test } from "vitest";

import { useCompareBasket } from "./compare-basket";

const product = (id: string) => ({ id, name: `Producto ${id}` });

beforeEach(() => {
  useCompareBasket.setState({ items: [] });
});

// La canasta de COMPARACIÓN no es un carrito: Save no vende. Junta productos para verlos lado a
// lado, así que lo único que importa es qué hay dentro y que no se repita.
describe("la canasta de comparación", () => {
  test("arranca vacía", () => {
    expect(useCompareBasket.getState().items).toEqual([]);
  });

  test("añade productos", () => {
    useCompareBasket.getState().add(product("a"));
    useCompareBasket.getState().add(product("b"));

    expect(useCompareBasket.getState().items.map((p) => p.id)).toEqual(["a", "b"]);
  });

  // Tocar «+» dos veces sobre el mismo producto NO lo mete dos veces: comparar un producto consigo
  // mismo no significa nada, y el contador mentiría.
  test("no admite repetidos", () => {
    useCompareBasket.getState().add(product("a"));
    useCompareBasket.getState().add(product("a"));

    expect(useCompareBasket.getState().items).toHaveLength(1);
  });

  test("quita un producto", () => {
    useCompareBasket.getState().add(product("a"));
    useCompareBasket.getState().add(product("b"));

    useCompareBasket.getState().remove("a");

    expect(useCompareBasket.getState().items.map((p) => p.id)).toEqual(["b"]);
  });

  // El «+» de la tarjeta es un INTERRUPTOR: el mismo gesto que mete, saca. Sin esto, quitar
  // obligaría a irse a otra pantalla.
  test("toggle mete y saca con el mismo gesto", () => {
    useCompareBasket.getState().toggle(product("a"));
    expect(useCompareBasket.getState().has("a")).toBe(true);

    useCompareBasket.getState().toggle(product("a"));
    expect(useCompareBasket.getState().has("a")).toBe(false);
  });

  test("sabe si un producto ya está dentro", () => {
    useCompareBasket.getState().add(product("a"));

    expect(useCompareBasket.getState().has("a")).toBe(true);
    expect(useCompareBasket.getState().has("z")).toBe(false);
  });

  test("se vacía de una vez", () => {
    useCompareBasket.getState().add(product("a"));
    useCompareBasket.getState().add(product("b"));

    useCompareBasket.getState().clear();

    expect(useCompareBasket.getState().items).toEqual([]);
  });

  // Comparar 40 productos no es comparar, es una lista. El tope protege la pantalla de comparación
  // —y al usuario— de un estado que no sirve para nada.
  test("tiene tope y el que sobra NO entra", () => {
    for (let i = 0; i < 30; i++) useCompareBasket.getState().add(product(`p${i}`));

    const items = useCompareBasket.getState().items;
    expect(items).toHaveLength(20);
    // Se queda con los PRIMEROS: lo que ya elegiste manda sobre lo que tocaste de más.
    expect(items[0]?.id).toBe("p0");
    expect(items.at(-1)?.id).toBe("p19");
  });

  test("lleno, añadir no rompe ni reordena", () => {
    for (let i = 0; i < 20; i++) useCompareBasket.getState().add(product(`p${i}`));

    useCompareBasket.getState().add(product("tarde"));

    expect(useCompareBasket.getState().has("tarde")).toBe(false);
    expect(useCompareBasket.getState().items).toHaveLength(20);
  });
});

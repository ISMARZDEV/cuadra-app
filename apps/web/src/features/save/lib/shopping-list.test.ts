import { describe, expect, it } from "vitest";

import {
  addToList,
  listCount,
  listTotal,
  removeFromList,
  setQty,
  type ShoppingListItem,
} from "./shopping-list";

const item = (id: string, price: number, qty = 1): ShoppingListItem => ({
  id,
  name: `Producto ${id}`,
  brand: "Marca",
  image_url: null,
  price_minor: price,
  currency: "DOP",
  qty,
});

describe("addToList", () => {
  it("agrega un ítem nuevo", () => {
    const out = addToList([], item("a", 42400));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });

  it("suma la cantidad si el ítem ya está (no duplica)", () => {
    const out = addToList([item("a", 42400, 1)], item("a", 42400, 2));
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(3);
  });

  it("no muta el array original", () => {
    const orig = [item("a", 42400)];
    addToList(orig, item("b", 1000));
    expect(orig).toHaveLength(1);
  });
});

describe("removeFromList", () => {
  it("quita por id", () => {
    const out = removeFromList([item("a", 1), item("b", 2)], "a");
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("setQty", () => {
  it("fija la cantidad", () => {
    const out = setQty([item("a", 100, 1)], "a", 5);
    expect(out[0].qty).toBe(5);
  });

  it("qty ≤ 0 quita el ítem", () => {
    const out = setQty([item("a", 100, 1)], "a", 0);
    expect(out).toHaveLength(0);
  });
});

describe("listCount / listTotal", () => {
  const items = [item("a", 42400, 2), item("b", 10000, 3)];
  it("count = suma de cantidades", () => {
    expect(listCount(items)).toBe(5);
  });
  it("total = suma de precio×cantidad", () => {
    expect(listTotal(items)).toBe(42400 * 2 + 10000 * 3);
  });
});

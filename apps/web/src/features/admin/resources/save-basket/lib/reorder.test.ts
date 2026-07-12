import type { BasketQueryDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { reorderPositions } from "./reorder";

function e(id: string, position: number): BasketQueryDto {
  return { id, market_id: "DO", category_label: null, query_text: id, position, active: true };
}

const LIST = [e("a", 10), e("b", 20), e("c", 30), e("d", 40)];

describe("reorderPositions", () => {
  it("dragging one step swaps only the two affected positions", () => {
    // mover 'c' (idx 2) sobre 'b' (idx 1) → orden a,c,b,d; rango [1,2] conserva posiciones 20,30
    const patches = reorderPositions(LIST, "c", "b");
    expect(patches).toEqual([
      { id: "c", position: 20 },
      { id: "b", position: 30 },
    ]);
  });

  it("dragging across a range reassigns the range's positions in the new order", () => {
    // mover 'a' (idx 0) al final (sobre 'd', idx 3) → orden b,c,d,a; posiciones 10,20,30,40
    const patches = reorderPositions(LIST, "a", "d");
    expect(patches).toEqual([
      { id: "b", position: 10 },
      { id: "c", position: 20 },
      { id: "d", position: 30 },
      { id: "a", position: 40 },
    ]);
  });

  it("no-op when dropping on itself or an unknown id", () => {
    expect(reorderPositions(LIST, "a", "a")).toEqual([]);
    expect(reorderPositions(LIST, "a", "zzz")).toEqual([]);
  });
});

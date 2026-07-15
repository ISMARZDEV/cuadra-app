import { describe, expect, it } from "vitest";

import { asList } from "./query";

describe("asList", () => {
  it("parte por coma, trimea y descarta vacíos", () => {
    expect(asList("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("undefined o vacío → []", () => {
    expect(asList(undefined)).toEqual([]);
    expect(asList("")).toEqual([]);
  });
});

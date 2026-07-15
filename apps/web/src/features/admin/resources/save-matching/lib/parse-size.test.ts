import { describe, expect, it } from "vitest";

import { parseSize } from "./parse-size";

describe("parseSize", () => {
  it("splits an amount + unit ('24 Oz' -> {amount:'24', unit:'Oz'})", () => {
    expect(parseSize("24 Oz")).toEqual({ amount: "24", unit: "Oz" });
  });

  it("keeps decimals in the amount ('2.0 Kg')", () => {
    expect(parseSize("2.0 Kg")).toEqual({ amount: "2.0", unit: "Kg" });
  });

  it("handles one-decimal units ('115.2 Gr')", () => {
    expect(parseSize("115.2 Gr")).toEqual({ amount: "115.2", unit: "Gr" });
  });

  it("handles integer pounds ('1 Lb')", () => {
    expect(parseSize("1 Lb")).toEqual({ amount: "1", unit: "Lb" });
  });

  it("tolerates no whitespace between amount and unit ('10LB')", () => {
    expect(parseSize("10LB")).toEqual({ amount: "10", unit: "LB" });
  });

  it("no unit present -> amount is the raw text, unit is null", () => {
    expect(parseSize("500")).toEqual({ amount: "500", unit: null });
  });

  it("empty string -> both null", () => {
    expect(parseSize("")).toEqual({ amount: null, unit: null });
  });

  it("null/undefined -> both null (never throws)", () => {
    expect(parseSize(null)).toEqual({ amount: null, unit: null });
    expect(parseSize(undefined)).toEqual({ amount: null, unit: null });
  });
});

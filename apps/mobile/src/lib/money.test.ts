import { describe, expect, test } from "vitest";

import { formatMoney } from "./money";

describe("formatMoney", () => {
  test("formats 2-decimal currencies (USD/DOP default)", () => {
    expect(formatMoney(135000, "USD")).toBe("$1,350.00");
    expect(formatMoney(1900000, "DOP")).toBe("$19,000.00");
  });

  test("formats negative amounts with a leading minus, before the sign", () => {
    expect(formatMoney(-135000, "USD")).toBe("-$1,350.00");
  });

  test("formats zero-decimal currencies (JPY) without a decimal point", () => {
    expect(formatMoney(500, "JPY")).toBe("$500");
  });

  test("formats 3-decimal currencies (KWD)", () => {
    expect(formatMoney(1234, "KWD")).toBe("$1.234");
  });

  test("is case-insensitive on the currency code", () => {
    expect(formatMoney(500, "jpy")).toBe("$500");
  });
});

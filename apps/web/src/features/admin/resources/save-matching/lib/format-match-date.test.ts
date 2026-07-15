import { describe, expect, it } from "vitest";

import { formatMatchDate } from "./format-match-date";

describe("formatMatchDate", () => {
  it("formats an ISO date as 'Weekday day, Month year' (es)", () => {
    // 2026-03-02 is a Monday in UTC (Saturday would be another sample); assert shape, not the
    // exact ICU weekday string (varies by Node/ICU build) — capitalized weekday+month is the
    // contract, not the specific word.
    const out = formatMatchDate("2026-03-02T00:00:00Z", "es");
    expect(out).toMatch(/^[A-ZÁÉÍÓÚ][a-záéíóú]+ 2, [A-ZÁÉÍÓÚ][a-záéíóú]+ 2026$/);
  });

  it("localizes the month/weekday to the given locale (en)", () => {
    const out = formatMatchDate("2026-03-02T00:00:00Z", "en");
    expect(out).toMatch(/^[A-Z][a-z]+ 2, [A-Z][a-z]+ 2026$/);
  });

  it("gracefully handles an invalid date (never throws)", () => {
    expect(formatMatchDate("not-a-date", "es")).toBe("—");
  });
});

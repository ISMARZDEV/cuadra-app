import { describe, expect, it } from "vitest";

import { formatLastSeen, formatRelativeAge } from "./format-freshness";

const NOW = new Date("2026-07-13T21:39:00Z");

describe("formatRelativeAge", () => {
  it("picks days as the unit when >= 1 day old (es)", () => {
    // 2026-07-12 21:02 → ~1 día antes de NOW
    expect(formatRelativeAge("2026-07-12T21:02:00Z", "es", NOW)).toBe("hace 1 día");
  });

  it("picks hours when between 1h and 1d (es)", () => {
    expect(formatRelativeAge("2026-07-13T18:39:00Z", "es", NOW)).toBe("hace 3 horas");
  });

  it("picks minutes when < 1h (es)", () => {
    expect(formatRelativeAge("2026-07-13T21:34:00Z", "es", NOW)).toBe("hace 5 minutos");
  });

  it("localizes to the given locale (en)", () => {
    expect(formatRelativeAge("2026-07-12T21:02:00Z", "en", NOW)).toBe("1 day ago");
  });

  it("returns dash for null / never-ingested", () => {
    expect(formatRelativeAge(null, "es", NOW)).toBe("—");
    expect(formatRelativeAge(undefined, "es", NOW)).toBe("—");
  });
});

describe("formatLastSeen", () => {
  it("formats a short localized UTC timestamp in 12h AM/PM (like the review queue)", () => {
    // Forma, no la palabra ICU exacta del mes/AM-PM (varía por build de Node/ICU). 21:02 UTC = 9:02 PM.
    const out = formatLastSeen("2026-07-12T21:02:00Z", "es");
    expect(out).toMatch(/12 .+ 2026, 9:02/);
    expect(out).not.toContain("21:02"); // 12h, no 24h
  });

  it("returns dash for null", () => {
    expect(formatLastSeen(null, "es")).toBe("—");
  });
});

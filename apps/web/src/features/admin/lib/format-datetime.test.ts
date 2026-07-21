import { describe, expect, it } from "vitest";

import { formatAdminDateTime } from "./format-datetime";

describe("formatAdminDateTime", () => {
  it("renders 12-hour time with AM/PM, like the rest of the admin", () => {
    // 24h era lo que rompía la consistencia: la cola de revisión y Fuentes ya usaban AM/PM.
    const out = formatAdminDateTime("2026-07-19T16:54:54Z", "es");

    expect(out).toMatch(/4:54/);
    expect(out.toLowerCase()).toMatch(/p\.?\s?m\.?/);
  });

  it("is pinned to UTC so two operators in different timezones see the SAME instant", () => {
    // Sin `timeZone: "UTC"` el mismo evento se leería distinto según el navegador, y un test pasaría
    // o fallaría según dónde corre.
    expect(formatAdminDateTime("2026-07-19T16:54:54Z", "es")).toBe(
      formatAdminDateTime("2026-07-19T16:54:54+00:00", "es"),
    );
  });

  it("returns an honest dash for a missing or unparseable date", () => {
    expect(formatAdminDateTime(null, "es")).toBe("—");
    expect(formatAdminDateTime(undefined, "es")).toBe("—");
    expect(formatAdminDateTime("no-soy-una-fecha", "es")).toBe("—");
  });
});

import type { PageContext } from "vike/types";
import { describe, expect, it } from "vitest";

import { guard } from "./+guard";

function context(overrides: Partial<PageContext>): PageContext {
  return {
    urlPathname: "/",
    needsLocaleRedirect: false,
    acceptLanguage: "es",
    ...overrides,
  } as PageContext;
}

describe("root +guard", () => {
  it("no redirige /admin/* — tiene su propio gate + SEO exento (pages/admin/+guard.ts)", () => {
    expect(() =>
      guard(context({ urlPathname: "/admin/review-queue", needsLocaleRedirect: true })),
    ).not.toThrow();
  });

  it("sigue redirigiendo rutas públicas sin prefijo locale/país", () => {
    expect(() =>
      guard(context({ urlPathname: "/save/supermarkets", needsLocaleRedirect: true })),
    ).toThrow();
  });

  it("no redirige cuando needsLocaleRedirect es false (ruta pública ya prefijada)", () => {
    expect(() =>
      guard(context({ urlPathname: "/es/DO/save/supermarkets", needsLocaleRedirect: false })),
    ).not.toThrow();
  });
});

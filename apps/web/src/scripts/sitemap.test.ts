import { describe, expect, it } from "vitest";

import { logicalPaths } from "./sitemap.js";

describe("sitemap logicalPaths", () => {
  it("nunca incluye /admin/* (consola OFV, no es superficie pública/SEO)", () => {
    const paths = logicalPaths([{ slug: "arroz-1kg" }]);
    expect(paths.some((p) => p.startsWith("/admin"))).toBe(false);
  });

  it("sigue incluyendo las rutas públicas esperadas", () => {
    const paths = logicalPaths([{ slug: "arroz-1kg" }]);
    expect(paths).toEqual([
      "/",
      "/save/supermarkets",
      "/save/supermarkets/categories",
      "/save/supermarkets/product/arroz-1kg",
    ]);
  });
});

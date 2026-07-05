import { describe, expect, it } from "vitest";

import { localeHref } from "./links";

describe("localeHref", () => {
  it("prefija rutas lógicas con /{locale}/{country}", () => {
    expect(localeHref("en", "do", "/product/123")).toBe("/en/do/product/123");
    expect(localeHref("es", "do", "/search")).toBe("/es/do/search");
  });

  it("la raíz '/' no deja slash colgando", () => {
    expect(localeHref("pt", "do", "/")).toBe("/pt/do");
  });
});

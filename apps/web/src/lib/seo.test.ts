import type { PriceComparisonDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { buildProductJsonLd } from "./seo";
import { buildRobots, buildSitemap, sitemapEntries } from "./sitemap.js";

const comparison: PriceComparisonDto = {
  canonical_product_id: "c1",
  name: "Arroz Enriquecido La Garza",
  currency: "DOP",
  cheapest_provider: "Merca Jumbo",
  spread_minor: 5100,
  entries: [
    { provider_id: "p1", provider_name: "Merca Jumbo", price_minor: 42400, currency: "DOP", unit_price_minor: 9349, unit_measure: "mass", is_cheapest: true, extra_minor: 0 },
    { provider_id: "p2", provider_name: "Sirena", price_minor: 47500, currency: "DOP", unit_price_minor: 10474, unit_measure: "mass", is_cheapest: false, extra_minor: 5100 },
  ],
};

describe("buildProductJsonLd", () => {
  it("emite Product + AggregateOffer con rango de precio y conteo de ofertas", () => {
    const ld = buildProductJsonLd(comparison);
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Arroz Enriquecido La Garza");
    expect(ld.offers).toEqual({
      "@type": "AggregateOffer",
      priceCurrency: "DOP",
      lowPrice: "424.00",
      highPrice: "475.00",
      offerCount: 2,
    });
  });
});

describe("sitemapEntries + buildSitemap", () => {
  const products = [{ id: "c1" }];

  it("incluye home, buscar y una URL por producto", () => {
    expect(sitemapEntries(products).map((e) => e.path)).toEqual(["/", "/buscar", "/producto/c1"]);
  });

  it("genera XML válido con <loc> absolutas y sin dobles slashes", () => {
    const xml = buildSitemap("https://save.cuadra.app/", sitemapEntries(products));
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<loc>https://save.cuadra.app/producto/c1</loc>");
    expect(xml).not.toContain("//producto");
  });

  it("emite hreflang alternates cuando hay locales (i18n-ready)", () => {
    const xml = buildSitemap("https://save.cuadra.app", sitemapEntries(products), ["es", "en", "pt"]);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="en" href="https://save.cuadra.app/en/producto/c1"');
  });
});

describe("buildRobots", () => {
  it("permite todo y apunta al sitemap", () => {
    const txt = buildRobots("https://save.cuadra.app/");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Sitemap: https://save.cuadra.app/sitemap.xml");
  });
});

import type { PriceComparisonDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { buildProductJsonLd } from "./seo";
import { buildRobots, buildSitemap, logicalPaths } from "./sitemap.js";

const comparison: PriceComparisonDto = {
  canonical_product_id: "c1",
  name: "Arroz Enriquecido La Garza",
  brand: "La Garza",
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

describe("logicalPaths + buildSitemap (i18n × país)", () => {
  const products = [{ id: "c1" }];
  const paths = logicalPaths(products);
  const opts = { locales: ["es", "en", "pt"], country: "do", paths, defaultLocale: "es" };

  it("las rutas lógicas: landing, Supermercados, categorías y una por producto (slugs inglés)", () => {
    expect(paths).toEqual([
      "/",
      "/save/supermarkets",
      "/save/supermarkets/categories",
      "/save/supermarkets/product/c1",
    ]);
  });

  it("emite un <url> cerrado por locale×ruta con <loc> absolutas prefijadas", () => {
    const xml = buildSitemap("https://cuadra.app/", opts);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<loc>https://cuadra.app/es/do/save/supermarkets/product/c1</loc>");
    expect(xml).toContain("<loc>https://cuadra.app/en/do/save/supermarkets/product/c1</loc>");
    expect(xml).toContain("</url>"); // cierre correcto (antes faltaba)
    expect(xml).not.toContain("/do//"); // sin doble slash en el path
  });

  it("cada URL trae hreflang es-do/en-do/pt-do + x-default", () => {
    const xml = buildSitemap("https://cuadra.app", opts);
    expect(xml).toContain('hreflang="en-do" href="https://cuadra.app/en/do/save/supermarkets"');
    expect(xml).toContain('hreflang="x-default" href="https://cuadra.app/es/do"');
  });
});

describe("buildRobots", () => {
  it("permite todo y apunta al sitemap", () => {
    const txt = buildRobots("https://save.cuadra.app/");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Sitemap: https://save.cuadra.app/sitemap.xml");
  });
});

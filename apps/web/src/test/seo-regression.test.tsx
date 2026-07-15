// Guard de REGRESIÓN SEO: la página de producto DEBE emitir <link rel="canonical"> (apuntando al
// SLUG), og:image y og:url. Son invariantes no-negociables (skill cuadra-web §3) — un refactor
// nunca puede quitarlos en silencio. Monta el +Head real con los hooks de Vike mockeados.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// vi.hoisted → el fixture existe antes que los vi.mock (que se elevan sobre los imports).
const { comparison } = vi.hoisted(() => ({
  comparison: {
    canonical_product_id: "c1",
    slug: "arroz-la-garza-10-lb",
    name: "Arroz La Garza",
    brand: "La Garza",
    image_url: "https://img.example/arroz.jpg",
    currency: "DOP",
    cheapest_provider: "Merca",
    spread_minor: 0,
    breadcrumb: [],
    entries: [
      {
        provider_id: "p1", provider_name: "Merca", price_minor: 42400, currency: "DOP",
        unit_price_minor: 1, unit_measure: "mass", is_cheapest: true, extra_minor: 0,
      },
    ],
  },
}));

vi.mock("vike-react/useData", () => ({ useData: () => ({ comparison }) }));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({
    locale: "es",
    country: "do",
    urlPathname: "/es/do/save/supermarkets/product/arroz-la-garza-10-lb",
  }),
}));

import Head from "../../pages/save/supermarkets/product/@slug/+Head";

describe("regresión SEO — +Head de producto (invariante no-negociable)", () => {
  it("emite <link rel=canonical> por SLUG + og:image + og:url", () => {
    render(<Head />);
    // document-level: React puede hoistear <link>/<meta> a <head>; así se encuentran igual.
    const canonical = document.querySelector('link[rel="canonical"]');
    expect(canonical, "falta <link rel=canonical>").not.toBeNull();
    expect(canonical?.getAttribute("href")).toContain(
      "/save/supermarkets/product/arroz-la-garza-10-lb",
    );
    expect(
      document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      "falta og:image (previews de WhatsApp sin imagen)",
    ).toBe(comparison.image_url);
    expect(document.querySelector('meta[property="og:url"]'), "falta og:url").not.toBeNull();
  });
});

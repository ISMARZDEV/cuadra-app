import type { PriceComparisonDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompareTable } from "./compare-table";

const comparison: PriceComparisonDto = {
  canonical_product_id: "c1",
  name: "Arroz La Garza 10 Lbs",
  brand: "La Garza",
  currency: "DOP",
  cheapest_provider: "Merca",
  spread_minor: 5100,
  entries: [
    {
      provider_id: "p1", provider_name: "Merca", price_minor: 42400, currency: "DOP",
      unit_price_minor: 9349, unit_measure: "mass", is_cheapest: true, extra_minor: 0,
    },
    {
      provider_id: "p2", provider_name: "Sirena", price_minor: 47500, currency: "DOP",
      unit_price_minor: 10474, unit_measure: "mass", is_cheapest: false, extra_minor: 5100,
    },
  ],
};

describe("CompareTable", () => {
  it("marca la tienda más barata como 'Mejor precio' (es)", () => {
    render(<CompareTable comparison={comparison} locale="es" />);
    const cheapestRow = screen.getByText("Merca").closest("tr");
    expect(cheapestRow).toHaveClass("cheapest");
    expect(screen.getByText("Mejor precio")).toBeInTheDocument();
  });

  it("traduce los encabezados según el locale (en)", () => {
    render(<CompareTable comparison={comparison} locale="en" />);
    expect(screen.getByText("Best price")).toBeInTheDocument();
    expect(screen.getByText("Supermarket")).toBeInTheDocument();
  });

  it("muestra el sobreprecio de las demás tiendas (+RD$51.00)", () => {
    render(<CompareTable comparison={comparison} locale="es" />);
    expect(screen.getByText(/\+.*51[.,]00/)).toBeInTheDocument();
  });
});

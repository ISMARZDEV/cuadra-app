import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StoreProductPanel } from "./StoreProductPanel";

const props = {
  name: "Arroz Goya Canilla Extra Largo 10 Lb",
  brand: "GOYA",
  sizeText: "10 Lb",
  imageUrl: "https://example.com/goya.png",
  sku: "sku-abc123",
  ean: "7460100000123",
  providerName: "Sirena",
  url: "https://sirena.do/arroz-goya-canilla-10lb/p",
  confidence: 0.85,
  method: "llm",
  candidateCount: 5,
  locale: "es" as const,
};

describe("StoreProductPanel", () => {
  it("muestra nombre, marca, tamaño y el EAN (campo combinado SKU / EAN, EAN preferido)", () => {
    render(<StoreProductPanel {...props} />);
    expect(screen.getByText("Arroz Goya Canilla Extra Largo 10 Lb")).toBeInTheDocument();
    expect(screen.getByText("GOYA")).toBeInTheDocument();
    expect(screen.getByText("10 Lb")).toBeInTheDocument();
    expect(screen.getByText("SKU / EAN")).toBeInTheDocument();
    expect(screen.getByText("7460100000123")).toBeInTheDocument();
  });

  it("sin EAN → cae al SKU en el campo combinado", () => {
    render(<StoreProductPanel {...props} ean={null} />);
    expect(screen.getByText("sku-abc123")).toBeInTheDocument();
  });

  it("muestra el donut de confianza, el método y el conteo de candidatos", () => {
    render(<StoreProductPanel {...props} />);
    expect(screen.getByRole("img", { name: /confianza del match 85%/i })).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/candidatos encontrados/i)).toBeInTheDocument();
  });

  it("SKU/EAN ausentes → placeholder '—'", () => {
    render(<StoreProductPanel {...props} sku={null} ean={null} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("muestra el botón 'Ver en la tienda' enlazando al url del producto (nueva pestaña)", () => {
    // F0 (link a la tienda): el detalle abre la página del producto en la tienda origen.
    render(<StoreProductPanel {...props} />);
    const link = screen.getByRole("link", { name: /ver en la tienda/i });
    expect(link).toHaveAttribute("href", "https://sirena.do/arroz-goya-canilla-10lb/p");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sin url → no muestra el botón 'Ver en la tienda'", () => {
    render(<StoreProductPanel {...props} url={null} />);
    expect(screen.queryByRole("link", { name: /ver en la tienda/i })).not.toBeInTheDocument();
  });
});

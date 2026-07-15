import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderBadge } from "./provider-badge";

describe("ProviderBadge", () => {
  it("falls back to the BUNDLED chain logo by name when there is no logoUrl (Sirena → sirena.png)", () => {
    render(<ProviderBadge name="Sirena" logoUrl={null} />);
    // "Sirena" está en `provider-logos` → renderiza su logo bundleado (img), no el texto.
    expect(screen.getByRole("img", { name: "Sirena" })).toBeInTheDocument();
    expect(screen.queryByText("Sirena")).not.toBeInTheDocument();
  });

  it("renders the store name as text ONLY when there is neither logoUrl nor a bundled logo", () => {
    render(<ProviderBadge name="OtroMercado" />);
    expect(screen.getByText("OtroMercado")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the logo image (lazy) with the store name as alt text when logoUrl is present", () => {
    render(<ProviderBadge name="Jumbo" logoUrl="https://cdn.example.com/jumbo.png" />);
    const img = screen.getByRole("img", { name: "Jumbo" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/jumbo.png");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.queryByText("Jumbo")).not.toBeInTheDocument();
  });
});

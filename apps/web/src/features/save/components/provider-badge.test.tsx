import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderBadge } from "./provider-badge";

describe("ProviderBadge", () => {
  it("renders the store name as text when there is no logo (fallback that MOST providers need today)", () => {
    render(<ProviderBadge name="Sirena" logoUrl={null} />);
    expect(screen.getByText("Sirena")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the same text fallback when logoUrl is undefined", () => {
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

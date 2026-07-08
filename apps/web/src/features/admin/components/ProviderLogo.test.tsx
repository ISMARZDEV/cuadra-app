import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderLogo } from "./ProviderLogo";

describe("ProviderLogo", () => {
  it("renderiza el <img> cuando llega logoUrl", () => {
    render(<ProviderLogo name="La Sirena" logoUrl="https://cdn.test/la-sirena.png" />);

    const img = screen.getByRole("img", { name: "La Sirena" });
    expect(img).toHaveAttribute("src", "https://cdn.test/la-sirena.png");
  });

  it("fallback de texto cuando no hay logoUrl (la mayoría de providers hoy)", () => {
    render(<ProviderLogo name="La Sirena" logoUrl={null} />);

    expect(screen.getByText("La Sirena")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

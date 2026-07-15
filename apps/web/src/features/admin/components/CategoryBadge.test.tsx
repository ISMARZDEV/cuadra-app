import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryBadge } from "./CategoryBadge";

describe("CategoryBadge", () => {
  it("pinta el nombre con el bg/text del slug (mapa del Figma 502:6713)", () => {
    render(<CategoryBadge slug="frutas-verduras" name="Frutas & Verduras" />);

    const badge = screen.getByText("Frutas & Verduras");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ backgroundColor: "#dfffc8", color: "#335e00" });
  });

  it("slug null → fallback neutro + 'Sin categoría' (es)", () => {
    render(<CategoryBadge slug={null} name={null} />);

    const badge = screen.getByText("Sin categoría");
    expect(badge).toHaveStyle({ backgroundColor: "#f1f5f4", color: "#64748b" });
  });

  it("slug null con locale en → 'No category'", () => {
    render(<CategoryBadge slug={null} name={null} locale="en" />);

    expect(screen.getByText("No category")).toBeInTheDocument();
  });

  it("slug presente pero sin color en el mapa (categoría 15/16 pendiente) → fallback neutro, muestra el name igual", () => {
    render(<CategoryBadge slug="lacteos-huevos" name="Lácteos & Huevos" />);

    const badge = screen.getByText("Lácteos & Huevos");
    expect(badge).toHaveStyle({ backgroundColor: "#f1f5f4", color: "#64748b" });
  });
});

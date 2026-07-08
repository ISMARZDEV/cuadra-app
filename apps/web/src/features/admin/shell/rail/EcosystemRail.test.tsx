import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { EcosystemRail } from "./EcosystemRail";

// El rail es SIEMPRE oscuro (bg-black #091113 del Figma, nodo 484:6497) — no sigue el tema
// claro/oscuro de la app. Su único control interactivo es el botón de tema en el pie, que reusa
// la MISMA lógica que `components/layout/theme-toggle.tsx` (alterna `.dark` en `<html>`).
describe("EcosystemRail", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("renders the top icon cluster and bottom theme cluster as decorative images", () => {
    render(<EcosystemRail />);

    const images = screen.getAllByRole("presentation", { hidden: true });
    // Ambos <img alt=""> se exponen como `role="presentation"` — dos imágenes decorativas.
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it("exposes an accessible name on the theme toggle button", () => {
    render(<EcosystemRail />);

    expect(screen.getByRole("button", { name: /tema|theme/i })).toBeInTheDocument();
  });

  it("toggles the .dark class on document.documentElement when clicked", () => {
    render(<EcosystemRail />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    const toggle = screen.getByRole("button", { name: /tema|theme/i });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { DockInteraction } from "../interfaces";

import { DockInteractionView } from "./dock-interaction-view";

const interaction: DockInteraction = {
  prompt: "¿Te gustaría registrar este gasto de $500 USD?",
  options: [
    { label: "No, cancelar", value: "no", variant: "secondary", kind: "pill" },
    { label: "Sí, confirmar", value: "yes", variant: "primary", kind: "pill" },
  ],
};

describe("DockInteractionView", () => {
  test("renders the prompt and every option", () => {
    render(<DockInteractionView interaction={interaction} onSelect={vi.fn()} />);
    expect(screen.getByText("¿Te gustaría registrar este gasto de $500 USD?")).toBeInTheDocument();
    expect(screen.getByText("No, cancelar")).toBeInTheDocument();
    expect(screen.getByText("Sí, confirmar")).toBeInTheDocument();
  });

  test("tapping a pill reports the whole option (value + label)", () => {
    const onSelect = vi.fn();
    render(<DockInteractionView interaction={interaction} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Sí, confirmar"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "yes", label: "Sí, confirmar" }));
  });

  test("highlights the **amount** span (lime) inside the prompt", () => {
    const withAmount: DockInteraction = {
      prompt: "¿Registrar este gasto de **$500 USD**?",
      options: [{ label: "Sí", value: "yes", variant: "primary", kind: "pill" }],
    };
    render(<DockInteractionView interaction={withAmount} onSelect={vi.fn()} />);
    // the highlighted segment renders WITHOUT the ** markers, as its own node
    expect(screen.getByText("$500 USD")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  test("renders icon-only chips (suggestions) and reports them on tap", () => {
    const onSelect = vi.fn();
    const suggestions: DockInteraction = {
      prompt: "Estas son mis sugerencias, selecciona una:",
      options: [
        { label: "Olvidalo, sin categoria", value: "none", variant: "secondary", kind: "pill" },
        { label: null, value: "music", variant: "primary", kind: "chip", icon: "🎵" },
        { label: null, value: "fuel", variant: "primary", kind: "chip", icon: "⛽" },
      ],
    };
    render(<DockInteractionView interaction={suggestions} onSelect={onSelect} />);
    expect(screen.getByText("🎵")).toBeInTheDocument();
    fireEvent.click(screen.getByText("🎵"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "music", kind: "chip" }));
  });
});

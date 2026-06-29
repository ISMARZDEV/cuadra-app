import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { DockInteraction } from "../interfaces";

import { DockInteractionView } from "./dock-interaction-view";

const interaction: DockInteraction = {
  prompt: "¿Te gustaría registrar este gasto de $500 USD?",
  options: [
    { label: "No, cancelar", value: "no", variant: "secondary" },
    { label: "Sí, confirmar", value: "yes", variant: "primary" },
  ],
};

describe("DockInteractionView", () => {
  test("renders the prompt and every option", () => {
    render(<DockInteractionView interaction={interaction} onSelect={vi.fn()} />);
    expect(screen.getByText("¿Te gustaría registrar este gasto de $500 USD?")).toBeInTheDocument();
    expect(screen.getByText("No, cancelar")).toBeInTheDocument();
    expect(screen.getByText("Sí, confirmar")).toBeInTheDocument();
  });

  test("tapping an option reports its value, not its label", () => {
    const onSelect = vi.fn();
    render(<DockInteractionView interaction={interaction} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Sí, confirmar"));
    expect(onSelect).toHaveBeenCalledWith("yes");
  });
});

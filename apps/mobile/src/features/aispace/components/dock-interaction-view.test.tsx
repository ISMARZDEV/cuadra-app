import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { DockInteraction } from "../interfaces";

// Native side-effects (haptics + audio) — stub so the component imports in jsdom.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("@/lib/sounds", () => ({ sounds: { send: vi.fn() } }));

import { DockInteractionView } from "./dock-interaction-view";

const interaction: DockInteraction = {
  prompt: "¿Te gustaría registrar este gasto de $500 USD?",
  options: [
    { label: "No, cancelar", value: "no", variant: "secondary", kind: "pill" },
    { label: "Sí, confirmar", value: "yes", variant: "primary", kind: "pill" },
  ],
};

const productPicker: DockInteraction = {
  prompt: "¿Cuál de estos productos?",
  options: [
    {
      label: "Arroz Selecto 5 Lb",
      value: "p1",
      variant: "primary",
      kind: "product",
      product: {
        index: 1,
        canonical_product_id: "c1",
        name: "Arroz Selecto 5 Lb",
        brand: "Selecto",
        size: "5 Lb",
        image_url: null,
        url: "https://sirena.do/arroz",
        unit_price: "RD$485.00",
        currency: "DOP",
      },
    },
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

  test("tapping the product card selects it WITHOUT asking to open it in Save", () => {
    const onSelect = vi.fn();
    const onViewProduct = vi.fn();
    render(
      <DockInteractionView
        interaction={productPicker}
        onSelect={onSelect}
        onViewProduct={onViewProduct}
      />,
    );
    fireEvent.click(screen.getByText("Arroz Selecto 5 Lb"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "p1" }));
    // Only the lime bar may leave the conversation — the card body just picks the product.
    expect(onViewProduct).not.toHaveBeenCalled();
  });

  test("the lime bar is the only thing that asks to open the product in Save", () => {
    const onViewProduct = vi.fn();
    render(
      <DockInteractionView
        interaction={productPicker}
        onSelect={vi.fn()}
        onViewProduct={onViewProduct}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("View product")[0]!);
    expect(onViewProduct).toHaveBeenCalledWith(expect.objectContaining({ value: "p1" }));
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

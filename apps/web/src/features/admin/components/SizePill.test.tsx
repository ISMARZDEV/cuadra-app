import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SizePill } from "./SizePill";

describe("SizePill", () => {
  it("pinta el número con la píldora teal rellena de la cola de revisión", () => {
    render(<SizePill value="330" tone="amount" />);

    const pill = screen.getByText("330");
    expect(pill).toHaveClass("bg-[#007e62]");
    expect(pill).toHaveClass("text-[#c2fb7e]");
  });

  it("pinta la unidad con la píldora lima de la cola de revisión", () => {
    render(<SizePill value="Ml" tone="unit" />);

    const pill = screen.getByText("Ml");
    expect(pill).toHaveClass("bg-brand-lime");
    expect(pill).toHaveClass("text-[#3f6942]");
  });

  // Sin dato NO se pinta píldora: una píldora vacía leería como "hay un valor" cuando no lo hay.
  it("sin valor cae a guion sin píldora", () => {
    render(<SizePill value={null} tone="amount" />);

    const dash = screen.getByText("—");
    expect(dash).not.toHaveClass("bg-[#007e62]");
  });

  it("un string vacío también cae a guion", () => {
    render(<SizePill value="" tone="unit" />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

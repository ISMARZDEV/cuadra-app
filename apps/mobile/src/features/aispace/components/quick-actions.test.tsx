import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

import { QuickActions } from "./quick-actions";

describe("QuickActions", () => {
  beforeEach(() => setLanguage("es"));

  test("renders the four localized suggestion chips", () => {
    render(<QuickActions onSelect={vi.fn()} />);
    for (const label of [
      "¿Cuánto gasté este mes 📅?",
      "Quiero registrar un ingreso 📈📊",
      "Ayúdame con la lista de compras 🛒🛍️",
      "¿Cuánto dinero tengo disponible 💸?",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test("tapping a chip sends its prompt", () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />);
    fireEvent.click(screen.getByText("¿Cuánto gasté este mes 📅?"));
    expect(onSelect).toHaveBeenCalledWith("¿Cuánto gasté este mes 📅?");
  });
});

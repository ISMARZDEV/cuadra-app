import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { CategoryPicker } from "./CategoryPicker";

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

const LEAVES = [
  { id: "l1", name: "Arroz", top_name: "Granos", top_slug: "granos" },
  { id: "l2", name: "Leche", top_name: "Lácteos", top_slug: "lacteos" },
];

function renderPicker(overrides: Partial<Parameters<typeof CategoryPicker>[0]> = {}) {
  const onPick = vi.fn();
  render(
    <CategoryPicker
      currentId={null}
      suggestions={[
        { taxonomy_node_id: "l1", name: "Arroz", matched_tokens: ["arroz"], signal: "lexicon" },
      ]}
      leaves={LEAVES}
      onPick={onPick}
      t={t as never}
      {...overrides}
    />,
  );
  return { onPick };
}

describe("CategoryPicker", () => {
  it("muestra las sugerencias ANTES del árbol completo", () => {
    renderPicker();
    expect(screen.getByText("Sugerencias")).toBeInTheDocument();
    expect(screen.getByText("Árbol completo")).toBeInTheDocument();
  });

  it("cada sugerencia explica POR QUÉ se propone", () => {
    // US-CP-D2c: decisión informada, no caja negra.
    renderPicker();
    expect(screen.getByText("arroz")).toBeInTheDocument();
    // "léxico" aparece dos veces a propósito: en la señal de la sugerencia y en la aclaración
    // de que no hay IA generativa detrás.
    expect(screen.getAllByText(/léxico/).length).toBeGreaterThan(0);
  });

  it("sin sugerencias lo dice y deja el árbol como fallback", () => {
    // La regla sagrada: no inventar categoría.
    renderPicker({ suggestions: [] });
    expect(screen.getByText(/Sin sugerencias para este nombre/)).toBeInTheDocument();
    expect(screen.getByText("Árbol completo")).toBeInTheDocument();
  });

  it("elegir una sugerencia la propaga", () => {
    // La MISMA hoja aparece dos veces por diseño: como sugerencia y dentro del árbol completo.
    // La primera es la sugerencia, que es la que este test ejercita.
    const { onPick } = renderPicker();
    screen.getAllByRole("button", { name: /Arroz/ })[0].click();
    expect(onPick).toHaveBeenCalledWith("l1");
  });

  it("elegir desde el árbol completo también funciona", () => {
    const { onPick } = renderPicker({ suggestions: [] });
    screen.getByRole("button", { name: /Arroz/ }).click();
    expect(onPick).toHaveBeenCalledWith("l1");
  });

  it("la categoría actual no se puede volver a elegir", () => {
    renderPicker({ currentId: "l1" });
    expect(screen.getAllByRole("button", { name: /Arroz/ })[0]).toBeDisabled();
  });

  it("aclara que las sugerencias no vienen de IA generativa", () => {
    renderPicker();
    expect(screen.getByText(/Sin IA generativa/)).toBeInTheDocument();
  });
});

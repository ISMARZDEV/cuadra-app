import { act, render, screen } from "@testing-library/react";
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

  // ── Accesibilidad ──────────────────────────────────────────────────────────

  it("sus encabezados son h3, sin saltar un nivel", () => {
    // Vive dentro de un `Panel` que renderiza <h2>. Con <h4> se saltaba el h3 y un lector de
    // pantalla que navega por encabezados percibe una sección que falta.
    renderPicker();
    const h3 = screen.getAllByRole("heading", { level: 3 });
    expect(h3.map((h) => h.textContent)).toEqual(["Sugerencias", "Árbol completo"]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
  });

  // ── Divulgación progresiva del árbol ───────────────────────────────────────

  it("con categoría ya asignada, el árbol completo arranca colapsado", () => {
    // En el producto de arroz el árbol mostraba siete entradas de "Alcohol >" pese a tener ya
    // su categoría aceptada: ruido puro sobre una decisión que ya estaba tomada.
    renderPicker({ currentId: "l1" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver árbol completo/i })).toBeInTheDocument();
  });

  it("el árbol se abre cuando el operador lo pide", () => {
    renderPicker({ currentId: "l1" });

    act(() => {
      screen.getByRole("button", { name: /Ver árbol completo/i }).click();
    });

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("sin categoría asignada el árbol se muestra de entrada", () => {
    // Acá el árbol ES la tarea: esconderlo sería un click de peaje.
    renderPicker({ currentId: null });
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("el buscador muestra el foco en su contenedor", () => {
    // El `Input` anula su propio anillo (`focus-visible:ring-0`) porque el pill de alrededor es
    // el que debe mostrarlo. Sin `focus-within` en ese contenedor, el foco es INVISIBLE.
    renderPicker();
    const wrapper = screen.getByRole("searchbox").parentElement;
    expect(wrapper?.className).toMatch(/focus-within:ring-/);
  });
});

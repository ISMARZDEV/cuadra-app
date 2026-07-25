import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { BulkCategoryModal } from "./BulkCategoryModal";

const suggest = vi.fn();
const apply = vi.fn();
vi.mock("../api", () => ({
  suggestBulkCategories: (...a: unknown[]) => suggest(...a),
  bulkSetCanonicalCategory: (...a: unknown[]) => apply(...a),
}));

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);
const LEAVES = [{ id: "l1", name: "Arroz", top_name: "Granos", top_slug: "granos" }];

async function renderModal(advice: unknown, selected = ["a", "b"]) {
  suggest.mockResolvedValue(advice);
  await act(async () => {
    render(
      <BulkCategoryModal
        selected={selected}
        leaves={LEAVES}
        onClose={vi.fn()}
        onApplied={vi.fn()}
        t={t as never}
        locale="es"
      />,
    );
  });
}

const HOMOGENEOUS = {
  suggestions: [
    {
      taxonomy_node_id: "l1",
      name: "Arroz",
      product_count: 2,
      matched_tokens: ["arroz"],
      signal: "lexicon",
    },
  ],
  heterogeneous: false,
  without_signal: 0,
  selected_count: 2,
};

describe("BulkCategoryModal", () => {
  beforeEach(() => {
    suggest.mockReset();
    apply.mockReset();
  });

  it("dice a cuántos productos se va a aplicar", async () => {
    await renderModal(HOMOGENEOUS);
    expect(screen.getByText(/2 productos seleccionados/)).toBeInTheDocument();
  });

  it("muestra cuántos de los seleccionados apoyan cada sugerencia", async () => {
    await renderModal(HOMOGENEOUS);
    expect(screen.getByText(/2 de los seleccionados/)).toBeInTheDocument();
  });

  it("ADVIERTE cuando el lote parece heterogéneo", async () => {
    // Es la razón de ser del modal: asignar una sola categoría a cosas distintas ensucia varios
    // productos de un saque.
    await renderModal({ ...HOMOGENEOUS, heterogeneous: true });
    expect(screen.getByText(/parecen de categorías distintas/)).toBeInTheDocument();
  });

  it("un lote homogéneo NO se advierte", async () => {
    await renderModal(HOMOGENEOUS);
    expect(screen.queryByText(/parecen de categorías distintas/)).not.toBeInTheDocument();
  });

  it("avisa cuántos se clasificarían a ciegas", async () => {
    await renderModal({ ...HOMOGENEOUS, without_signal: 3 });
    expect(screen.getByText(/3 sin señal para sugerir/)).toBeInTheDocument();
  });

  it("sin sugerencias el árbol completo sigue disponible", async () => {
    await renderModal({ ...HOMOGENEOUS, suggestions: [], without_signal: 2 });
    expect(screen.getByText("Árbol completo")).toBeInTheDocument();
  });

  it("elegir una categoría la aplica a TODOS los seleccionados", async () => {
    apply.mockResolvedValue({ succeeded_count: 2, failed_count: 0 });
    await renderModal(HOMOGENEOUS);

    await act(async () => {
      screen.getAllByRole("button", { name: /Arroz/ })[0].click();
    });

    expect(apply).toHaveBeenCalledWith(["a", "b"], "l1");
    expect(screen.getByText(/2 productos actualizados/)).toBeInTheDocument();
  });

  it("reporta el éxito PARCIAL en vez de decir que todo salió bien", async () => {
    apply.mockResolvedValue({ succeeded_count: 1, failed_count: 1 });
    await renderModal(HOMOGENEOUS);

    await act(async () => {
      screen.getAllByRole("button", { name: /Arroz/ })[0].click();
    });

    expect(screen.getByText(/1 productos actualizados/)).toBeInTheDocument();
    expect(screen.getByText(/1 no se pudieron actualizar/)).toBeInTheDocument();
  });

  it("sin selección no se renderiza", () => {
    render(
      <BulkCategoryModal
        selected={[]}
        leaves={LEAVES}
        onClose={vi.fn()}
        onApplied={vi.fn()}
        t={t as never}
        locale="es"
      />,
    );
    expect(screen.queryByText(/Asignar categoría en lote/)).not.toBeInTheDocument();
  });
});

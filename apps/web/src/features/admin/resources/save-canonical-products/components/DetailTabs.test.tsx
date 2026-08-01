import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { DetailTabs, type DetailTabId } from "./DetailTabs";

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

function renderTabs(active: DetailTabId = "summary") {
  const onChange = vi.fn();
  render(<DetailTabs active={active} onChange={onChange} t={t as never} />);
  return { onChange };
}

describe("DetailTabs", () => {
  it("expone las cinco secciones como pestañas reales", () => {
    renderTabs();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((el) => el.textContent)).toEqual([
      "Resumen",
      "Categorías",
      "Descripción",
      "Imágenes del producto",
      "Auditoría",
    ]);
  });

  it("marca sólo la activa con aria-selected", () => {
    renderTabs("images");

    expect(screen.getByRole("tab", { name: "Imágenes del producto" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("avisa qué pestaña se eligió", async () => {
    const { onChange } = renderTabs();

    await act(async () => {
      screen.getByRole("tab", { name: "Auditoría" }).click();
    });

    expect(onChange).toHaveBeenCalledWith("audit");
  });

  // Roving tabindex: con cinco pestañas, dejar las cinco en el orden de tabulación obliga a
  // pasar por todas para llegar al contenido. El patrón ARIA pide UNA parada y flechas adentro.
  it("deja una sola parada en el orden de tabulación", () => {
    renderTabs("description");

    expect(screen.getByRole("tab", { name: "Descripción" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("tabindex", "-1");
  });

  it("mueve la selección con las flechas y da la vuelta en los extremos", async () => {
    const { onChange } = renderTabs("summary");

    await act(async () => {
      fireEvent.keyDown(screen.getByRole("tab", { name: "Resumen" }), { key: "ArrowRight" });
    });
    expect(onChange).toHaveBeenCalledWith("categories");

    // Desde la primera, ArrowLeft va a la ÚLTIMA: un tope mudo en el extremo se siente roto.
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("tab", { name: "Resumen" }), { key: "ArrowLeft" });
    });
    expect(onChange).toHaveBeenCalledWith("audit");
  });

  it("conecta cada pestaña con su panel", () => {
    renderTabs("summary");

    const tab = screen.getByRole("tab", { name: "Resumen" });
    expect(tab).toHaveAttribute("aria-controls", "canonical-detail-panel-summary");
    expect(tab).toHaveAttribute("id", "canonical-detail-tab-summary");
  });
});

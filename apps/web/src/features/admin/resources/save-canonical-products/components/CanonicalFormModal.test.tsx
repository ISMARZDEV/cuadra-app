import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { CanonicalFormModal } from "./CanonicalFormModal";

vi.mock("../api", () => ({
  createCanonicalProduct: vi.fn(),
  updateCanonicalProduct: vi.fn(),
}));

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

function renderModal() {
  render(
    <CanonicalFormModal
      state={{ mode: "create" }}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      t={t as never}
    />,
  );
}

/**
 * El contrato de accesibilidad del formulario de curación.
 *
 * `Field` renderizaba el `<label>` como HERMANO del control, sin `htmlFor`: un lector de pantalla
 * anunciaba "campo de texto, en blanco" en los 9 campos. El patrón correcto ya existía en
 * `admin/components/filters/FilterField.tsx` — esto lo alinea.
 */
describe("CanonicalFormModal · accesibilidad", () => {
  it("cada campo de texto tiene nombre accesible", () => {
    renderModal();

    expect(screen.getByRole("textbox", { name: /Nombre/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Marca/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Tamaño de empaque/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Calidad/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Descripción/i })).toBeInTheDocument();
  });

  it("el campo numérico de cantidad tiene nombre accesible", () => {
    renderModal();
    expect(screen.getByRole("spinbutton", { name: /Cantidad/i })).toBeInTheDocument();
  });

  it("la ayuda de marca queda enlazada como descripción, no suelta en el DOM", () => {
    renderModal();
    expect(screen.getByRole("textbox", { name: /Marca/i })).toHaveAccessibleDescription(
      /mayúscula/i,
    );
  });

  it("los campos obligatorios se anuncian como obligatorios", () => {
    // El asterisco rojo es una señal puramente visual.
    renderModal();
    expect(screen.getByRole("textbox", { name: /Nombre/i })).toBeRequired();
  });
});

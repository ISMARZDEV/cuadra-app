import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { DescriptionPanel } from "./DescriptionPanel";

const update = vi.fn();
vi.mock("../api", () => ({ updateCanonicalProduct: (...a: unknown[]) => update(...a) }));

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

const PROVIDERS = [
  {
    provider_id: "p1",
    provider_name: "Sirena",
    store_product_id: "sp-1",
    price_minor: 1000,
    currency: "DOP",
    provider_logo_url: null,
    store_product_image_url: null,
    store_product_image_urls: [],
    store_product_description: "Arroz de grano largo y calidad premium.",
    url: null,
    last_seen_at: null,
    is_cheapest: true,
  },
  {
    provider_id: "p2",
    provider_name: "Nacional",
    store_product_id: "sp-2",
    price_minor: 1100,
    currency: "DOP",
    provider_logo_url: null,
    store_product_image_url: null,
    store_product_image_urls: [],
    store_product_description: null,
    url: null,
    last_seen_at: null,
    is_cheapest: false,
  },
];

function renderPanel(description: string | null = null, providers = PROVIDERS) {
  const onSaved = vi.fn();
  render(
    <DescriptionPanel
      canonicalProductId="cp-1"
      description={description}
      providers={providers as never}
      onSaved={onSaved}
      t={t as never}
    />,
  );
  return { onSaved };
}

describe("DescriptionPanel", () => {
  beforeEach(() => update.mockReset());

  it("lista sólo las tiendas que publican descripción", () => {
    // Nacional no trae: mostrarla vacía sería ofrecer una candidata que no existe.
    renderPanel();
    expect(screen.getByText(/Arroz de grano largo/)).toBeInTheDocument();
    expect(screen.queryByText("Nacional")).not.toBeInTheDocument();
  });

  it("elegir una la copia al borrador SIN guardar todavía", async () => {
    // Guardar sigue siendo explícito: el operador puede ajustar el texto antes de publicarlo.
    renderPanel();

    await act(async () => {
      screen.getByRole("button", { name: /Usar esta/ }).click();
    });

    expect(screen.getByRole("textbox")).toHaveValue("Arroz de grano largo y calidad premium.");
    expect(update).not.toHaveBeenCalled();
  });

  it("avisa que hay cambios sin guardar", async () => {
    renderPanel();

    await act(async () => {
      screen.getByRole("button", { name: /Usar esta/ }).click();
    });

    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("guardar persiste el texto del borrador", async () => {
    update.mockResolvedValue({ description: "Arroz de grano largo y calidad premium." });
    renderPanel();

    await act(async () => {
      screen.getByRole("button", { name: /Usar esta/ }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Guardar descripción/ }).click();
    });

    expect(update).toHaveBeenCalledWith("cp-1", {
      description: "Arroz de grano largo y calidad premium.",
    });
  });

  it("sin cambios el botón de guardar está deshabilitado", () => {
    renderPanel("Arroz de grano largo y calidad premium.");
    expect(screen.getByRole("button", { name: /Guardar descripción/ })).toBeDisabled();
  });

  it("la candidata que ya está en uso se marca y no se puede volver a elegir", () => {
    renderPanel("Arroz de grano largo y calidad premium.");
    expect(screen.getByRole("button", { name: /En uso/ })).toBeDisabled();
  });

  it("vaciar el texto guarda null y no una cadena vacía", async () => {
    // Una cadena vacía en la base sería indistinguible de "tiene descripción pero está en blanco".
    update.mockResolvedValue({ description: null });
    renderPanel("Algo escrito");

    // `fireEvent.change` pasa por el setter nativo que React parchea; asignar `.value` a mano
    // no dispara el onChange y el borrador quedaría sin tocar.
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    });
    await act(async () => {
      screen.getByRole("button", { name: /Guardar descripción/ }).click();
    });

    expect(update).toHaveBeenCalledWith("cp-1", { description: null });
  });

  it("sin candidatas lo dice en vez de dejar un hueco", () => {
    renderPanel(null, [{ ...PROVIDERS[1] }] as never);
    expect(screen.getByText(/Ninguna tienda enlazada publica descripción/)).toBeInTheDocument();
  });

  it("aclara que copiar no toca el producto de la tienda", () => {
    renderPanel();
    expect(screen.getByText(/No modifica el producto de la tienda/)).toBeInTheDocument();
  });
});

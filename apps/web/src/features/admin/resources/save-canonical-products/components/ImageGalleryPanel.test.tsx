import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { ImageGalleryPanel } from "./ImageGalleryPanel";

const reorder = vi.fn();
const remove = vi.fn();
const add = vi.fn();
vi.mock("../api", () => ({
  reorderCanonicalImages: (...a: unknown[]) => reorder(...a),
  removeCanonicalImage: (...a: unknown[]) => remove(...a),
  addCanonicalImage: (...a: unknown[]) => add(...a),
}));

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

const PROVIDERS = [
  {
    provider_id: "p1",
    provider_name: "Sirena",
    store_product_id: "sp-1",
    price_minor: 1000,
    currency: "DOP",
    provider_logo_url: null,
    store_product_image_url: "https://cdn/sirena.jpg",
    store_product_image_urls: ["https://cdn/sirena.jpg", "https://cdn/sirena-nutricional.jpg"],
    url: null,
    last_seen_at: null,
    is_cheapest: true,
  },
];

const IMAGES = [
  { id: "i1", url: "https://cdn/a.jpg", position: 1, source_store_product_id: "sp-1", is_primary: true },
  { id: "i2", url: "https://cdn/b.jpg", position: 2, source_store_product_id: null, is_primary: false },
];

function renderPanel(images = IMAGES, providers = PROVIDERS) {
  const onChanged = vi.fn();
  render(
    <ImageGalleryPanel
      canonicalProductId="cp-1"
      images={images}
      providers={providers as never}
      onChanged={onChanged}
      t={t as never}
      locale="es"
    />,
  );
  return { onChanged };
}

describe("ImageGalleryPanel", () => {
  beforeEach(() => {
    reorder.mockReset();
    remove.mockReset();
    add.mockReset();
  });

  it("numera las posiciones (1ª, 2ª…)", () => {
    renderPanel();
    expect(screen.getByText("1ª imagen")).toBeInTheDocument();
    expect(screen.getByText("2ª imagen")).toBeInTheDocument();
  });

  it("dice que la posición 1 es la que ve el público", () => {
    // Sin esto el operador reordena sin saber que está cambiando lo que se publica.
    renderPanel();
    expect(screen.getByText(/la que ve el público/)).toBeInTheDocument();
  });

  it("muestra de qué tienda salió cada imagen", () => {
    renderPanel();
    expect(screen.getByText("De Sirena")).toBeInTheDocument();
    expect(screen.getByText("URL manual")).toBeInTheDocument();
  });

  it("la primera no se puede subir y la última no se puede bajar", () => {
    renderPanel();
    const up = screen.getAllByRole("button", { name: /Subir una posición/ });
    const down = screen.getAllByRole("button", { name: /Bajar una posición/ });
    expect(up[0]).toBeDisabled();
    expect(down[down.length - 1]).toBeDisabled();
  });

  it("reordenar manda la lista COMPLETA de ids", async () => {
    // El backend rechaza un subconjunto: dejaría imágenes sin posición.
    reorder.mockResolvedValue(IMAGES);
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[0].click();
    });

    expect(reorder).toHaveBeenCalledWith("cp-1", ["i2", "i1"]);
  });

  it("una candidata YA en la galería no se puede volver a agregar", () => {
    const images = [{ ...IMAGES[0], url: "https://cdn/sirena.jpg" }];
    renderPanel(images);
    expect(screen.getByRole("button", { name: /Ya en la galería/ })).toBeDisabled();
  });

  it("agregar una candidata pasa el store_product de origen", async () => {
    add.mockResolvedValue({ ...IMAGES[1], id: "i3" });
    renderPanel([]);

    await act(async () => {
      // Ahora hay una candidata por IMAGEN: la primera es la bolsa de Sirena.
      screen.getAllByRole("button", { name: /Agregar/ })[0].click();
    });

    expect(add).toHaveBeenCalledWith("cp-1", "https://cdn/sirena.jpg", "sp-1");
  });

  it("ofrece TODAS las imágenes de una tienda, no sólo la primera", () => {
    // El caso Sirena: bolsa + etiqueta nutricional. Con una candidata por tienda, la segunda
    // quedaba inalcanzable desde el admin.
    renderPanel([]);
    expect(screen.getAllByRole("button", { name: /Agregar/ })).toHaveLength(2);
  });

  it("numera las candidatas sólo cuando la tienda publica más de una", () => {
    // "Sirena 1/1" sería ruido; "1/2" y "2/2" dicen algo.
    renderPanel([]);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("galería vacía lo dice en vez de dejar un hueco", () => {
    renderPanel([]);
    expect(screen.getByText(/todavía no tiene imágenes/i)).toBeInTheDocument();
  });

  it("el botón de subir explica por qué todavía no hace nada", async () => {
    renderPanel();

    await act(async () => {
      screen.getByRole("button", { name: /Subir imagen/ }).click();
    });

    expect(screen.getByText(/falta definir dónde se guardarán/i)).toBeInTheDocument();
  });
});

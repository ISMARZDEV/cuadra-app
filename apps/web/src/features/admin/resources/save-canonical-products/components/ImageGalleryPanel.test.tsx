import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { ImageGalleryPanel } from "./ImageGalleryPanel";

vi.mock("@/features/admin/components/ProxiedImage", () => ({
  ProxiedImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const reorder = vi.fn();
const remove = vi.fn();
const add = vi.fn();
const list = vi.fn();
vi.mock("../api", () => ({
  reorderCanonicalImages: (...a: unknown[]) => reorder(...a),
  removeCanonicalImage: (...a: unknown[]) => remove(...a),
  addCanonicalImage: (...a: unknown[]) => add(...a),
  listCanonicalImages: (...a: unknown[]) => list(...a),
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
    list.mockReset();
  });

  it("numera las posiciones (1ª, 2ª…)", () => {
    renderPanel();
    expect(screen.getByText("1ª imagen")).toBeInTheDocument();
    expect(screen.getByText("2ª imagen")).toBeInTheDocument();
  });

  it("dice que la posición 1 es la que ve el público", () => {
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

  // ── Modelo borrador ────────────────────────────────────────────────────────

  it("reordenar modifica el borrador pero NO toca el servidor", async () => {
    const three = [
      ...IMAGES,
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    renderPanel(three);

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[1].click();
    });

    expect(reorder).not.toHaveBeenCalled();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("guardar manda la lista COMPLETA de ids en el orden final", async () => {
    const three = [
      ...IMAGES,
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    reorder.mockResolvedValue(three);
    renderPanel(three);

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[1].click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Guardar cambios/ }).click();
    });

    expect(reorder).toHaveBeenCalledWith("cp-1", ["i1", "i3", "i2"]);
  });

  it("cancelar revierte el borrador", async () => {
    const three = [
      ...IMAGES,
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    renderPanel(three);

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[1].click();
    });
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: /Cancelar/ }).click();
    });

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
  });

  it("guardar quita primero, agrega después y reordena al final", async () => {
    const images = [
      { ...IMAGES[0] },
      { id: "i2", url: "https://cdn/b.jpg", position: 2, source_store_product_id: null, is_primary: false },
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    add.mockResolvedValue({ id: "i4", url: "https://cdn/sirena.jpg", position: 3, source_store_product_id: "sp-1", is_primary: false });
    reorder.mockResolvedValue([
      images[0],
      { id: "i4", url: "https://cdn/sirena.jpg", position: 2, source_store_product_id: "sp-1", is_primary: false },
      images[2],
    ]);
    renderPanel(images, PROVIDERS);

    // 1) Quitar imagen intermedia del borrador (no toca posición 1).
    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[1].click();
    });

    // 2) Agregar candidata al borrador.
    await act(async () => {
      screen.getAllByRole("button", { name: /Agregar/ })[0].click();
    });

    // 3) Reordenar la agregada hacia arriba sin tocar la posición 1.
    await act(async () => {
      screen.getAllByRole("button", { name: /Subir una posición/ })[2].click();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Guardar cambios/ }).click();
    });

    expect(remove).toHaveBeenCalledWith("cp-1", "i2");
    expect(add).toHaveBeenCalledWith("cp-1", "https://cdn/sirena.jpg", "sp-1");
    expect(reorder).toHaveBeenCalledWith("cp-1", ["i1", "i4", "i3"]);
  });

  // ── Fricción proporcional al riesgo ────────────────────────────────────────

  it("quitar la imagen de la posición 1 pide confirmación antes de borrar del borrador", async () => {
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[0].click();
    });

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-accept")).toBeInTheDocument();
  });

  it("la confirmación explica el IMPACTO, no pregunta '¿estás seguro?'", async () => {
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[0].click();
    });

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/la que ve el público/i)).toBeInTheDocument();
    expect(dialog.getByText(/pasa a ocupar su lugar/i)).toBeInTheDocument();
  });

  it("confirmar quita del borrador y guardar ejecuta el borrado", async () => {
    remove.mockResolvedValue([IMAGES[1]]);
    list.mockResolvedValue([IMAGES[1]]);
    const { onChanged } = renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[0].click();
    });
    await act(async () => {
      screen.getByTestId("confirm-accept").click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Guardar cambios/ }).click();
    });

    expect(remove).toHaveBeenCalledWith("cp-1", "i1");
    expect(reorder).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("cancelar la confirmación NO borra nada", async () => {
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[0].click();
    });
    await act(async () => {
      screen.getByTestId("confirm-dismiss").click();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("quitar una imagen que NO es la pública no pide confirmación", async () => {
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Quitar de la galería/ })[1].click();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("subir la 2ª a la posición 1 pide confirmación (promociona lo que se publica)", async () => {
    renderPanel();

    await act(async () => {
      screen.getAllByRole("button", { name: /Subir una posición/ })[1].click();
    });

    expect(screen.getByTestId("confirm-accept")).toBeInTheDocument();
  });

  it("reordenar sin tocar la posición 1 no pide confirmación", async () => {
    const three = [
      ...IMAGES,
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    renderPanel(three);

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[1].click();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  // ── Candidatas ─────────────────────────────────────────────────────────────

  it("una candidata YA en la galería no se puede volver a agregar", () => {
    const images = [{ ...IMAGES[0], url: "https://cdn/sirena.jpg" }];
    renderPanel(images);
    expect(screen.getByRole("button", { name: /Ya en la galería/ })).toBeDisabled();
  });

  it("agregar una candidata solo modifica el borrador", async () => {
    add.mockResolvedValue({ id: "i3", url: "https://cdn/sirena.jpg", position: 1, source_store_product_id: "sp-1", is_primary: false });
    renderPanel([]);

    await act(async () => {
      screen.getAllByRole("button", { name: /Agregar/ })[0].click();
    });

    expect(add).not.toHaveBeenCalled();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("ofrece TODAS las imágenes de una tienda, no sólo la primera", () => {
    renderPanel([]);
    expect(screen.getAllByRole("button", { name: /Agregar/ })).toHaveLength(2);
  });

  it("numera las candidatas sólo cuando la tienda publica más de una", () => {
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

  it("muestra error si el guardado falla", async () => {
    const three = [
      ...IMAGES,
      { id: "i3", url: "https://cdn/c.jpg", position: 3, source_store_product_id: null, is_primary: false },
    ];
    reorder.mockRejectedValue(new Error("Network error"));
    renderPanel(three);

    await act(async () => {
      screen.getAllByRole("button", { name: /Bajar una posición/ })[1].click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Guardar cambios/ }).click();
    });

    expect(screen.getByText(/No se pudieron guardar las imágenes/i)).toBeInTheDocument();
  });
});

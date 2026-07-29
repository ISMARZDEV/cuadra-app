import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThumbnailLightbox } from "./ThumbnailLightbox";

function thumb(props: Partial<React.ComponentProps<typeof ThumbnailLightbox>> = {}) {
  return render(
    <ThumbnailLightbox
      src="https://cdn/a.jpg"
      alt="Arroz"
      title="Arroz Goya"
      count={3}
      emptyLabel="Sin imagen"
      {...props}
    />,
  );
}

describe("ThumbnailLightbox", () => {
  // Regla del usuario: el visor SOLO existe si hay algo que ver.
  it("sin imagen el thumbnail NO es clickeable", () => {
    thumb({ src: null });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("con imagen el thumbnail es un botón que abre el visor", async () => {
    thumb();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("lightbox-main")).toBeInTheDocument());
  });

  // Abrir con la imagen que YA se tiene evita un modal en blanco esperando la red: la foto de la
  // fila es la misma que la primera de la galería.
  it("abre al instante con la imagen de la fila, sin esperar la red", () => {
    thumb({ loadImages: () => new Promise(() => {}) });

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", "https://cdn/a.jpg");
  });

  it("al abrir carga el resto de la galería", async () => {
    const loadImages = vi.fn().mockResolvedValue(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    thumb({ loadImages });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("lightbox-thumb-1")).toBeInTheDocument());
    expect(loadImages).toHaveBeenCalledTimes(1);
  });

  it("no re-pide la galería al reabrir", async () => {
    const loadImages = vi.fn().mockResolvedValue(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    thumb({ loadImages });

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("lightbox-thumb-1")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Cerrar"));
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("lightbox-main")).toBeInTheDocument());
    expect(loadImages).toHaveBeenCalledTimes(1);
  });

  // Si la galería falla, el operador igual tiene que poder mirar la foto que la fila ya mostraba.
  it("si la carga falla se queda con la imagen de la fila", async () => {
    const loadImages = vi.fn().mockRejectedValue(new Error("red caída"));
    thumb({ loadImages });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("lightbox-main")).toBeInTheDocument());
    expect(screen.getByTestId("lightbox-main")).toHaveAttribute("src", "https://cdn/a.jpg");
    expect(screen.queryByTestId("lightbox-next")).not.toBeInTheDocument();
  });

  it("sin loader muestra sólo la imagen de la fila", async () => {
    thumb({ loadImages: undefined });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("lightbox-main")).toBeInTheDocument());
    expect(screen.queryByTestId("lightbox-next")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { HomeSearchBar } from "./home-search-bar";

// Esta píldora ya NO es un campo: es el ANCLA del buscador, que vive en `search-overlay`. Lo que
// hay que cuidar acá es que abra y que sepa DÓNDE está — sin esa medida, la hoja arrancaría su
// viaje desde un sitio aproximado y el relevo entre las dos se vería como un parpadeo.
const PLACEHOLDER = "Buscar producto…";

const noop = () => {};

describe("HomeSearchBar", () => {
  // `await waitFor` y no una aserción directa: la posición se mide con `measureInWindow`, que
  // llama a su callback de forma ASÍNCRONA. Ese detalle es justamente el que hace que abrir NO
  // pueda depender de la medida — ver el comentario en el componente.
  test("abre el buscador al tocarla, con su posición del momento", async () => {
    const onOpen = vi.fn();
    render(<HomeSearchBar placeholder={PLACEHOLDER} onOpen={onOpen} />);

    fireEvent.click(screen.getByLabelText(PLACEHOLDER));

    await waitFor(() => expect(onOpen).toHaveBeenCalled());
  });

  // Bajo jsdom `measureInWindow` devuelve 0, que es EXACTAMENTE lo que devuelve el lado nativo en el
  // primer toque tras montar la pantalla. O sea: este test corre el camino EN FRÍO.
  //
  // ⚠️ SEAMOS EXACTOS CON LO QUE ESTE TEST GUARDA Y LO QUE NO. No es el guardián del destello de la
  // barra: este componente ya decía la verdad («no lo sé»), y el defecto estaba AGUAS ABAJO, en la
  // pantalla que ignoraba ese «no lo sé» y se quedaba con su `fromY` inicial. Ese caso lo fija
  // `search-anchor.test.ts`, que es donde se verificó el RED.
  //
  // Lo que SÍ guarda: que este lado no vuelva a INVENTAR una posición plausible. Aquí vivió un
  // `lastY` que guardaba la última medida buena y la daba por válida más tarde, cuando el scroll ya
  // podía haberla dejado rancia. Una medida increíble se declara `undefined`, nunca un 0 disfrazado
  // de dato ni un recuerdo viejo.
  test("cuando la medida no es creíble avisa con undefined, no con un cero disfrazado", async () => {
    const onOpen = vi.fn();
    render(<HomeSearchBar placeholder={PLACEHOLDER} onOpen={onOpen} />);

    fireEvent.click(screen.getByLabelText(PLACEHOLDER));

    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    const [y] = onOpen.mock.calls[0];
    expect(y).toBeUndefined();
  });

  test("enseña el placeholder como texto, no como campo", () => {
    // Si esto volviera a ser un `input`, habría DOS campos para una sola búsqueda y el usuario no
    // sabría en cuál está escribiendo.
    render(<HomeSearchBar placeholder={PLACEHOLDER} onOpen={noop} />);

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

import { HubScreen } from "./hub-screen";
import { VERTICALS } from "./verticals";

// Las consultas van por ETIQUETA ACCESIBLE, no por texto: el card parte el título en las líneas
// del diseño («Super / market»), así que el nodo de texto ya no dice «Supermarket». La etiqueta
// sigue siendo la marca entera — que es justo lo que un lector de pantalla debe anunciar.
describe("HubScreen", () => {
  beforeEach(() => {
    setLanguage("es");
    push.mockClear();
  });

  test("muestra las cuatro verticales de Save", () => {
    render(<HubScreen />);

    expect(screen.getByLabelText("Supermarket")).toBeInTheDocument();
    expect(screen.getByLabelText("Credit Cards")).toBeInTheDocument();
    expect(screen.getByLabelText("Loans & Insurance")).toBeInTheDocument();
    expect(screen.getByLabelText("Investments")).toBeInTheDocument();
  });

  test("Promotions NO es una vertical: es una capa transversal", () => {
    render(<HubScreen />);

    expect(screen.queryByLabelText("Promotions")).toBeNull();
  });

  test("la campana lleva al feed de alertas — que dejó de ser la pantalla de Save", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByLabelText("Alertas de precio"));

    expect(push).toHaveBeenCalledWith("/save/alerts");
  });

  test("la vertical con datos navega a su stack", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByLabelText("Supermarket"));

    expect(push).toHaveBeenCalledWith("/save/supermarket");
  });

  test("una vertical sin datos NO navega — no manda a una pantalla vacía", () => {
    render(<HubScreen />);

    fireEvent.click(screen.getByLabelText("Credit Cards"));

    expect(push).not.toHaveBeenCalled();
  });
});

describe("el registro de verticales", () => {
  // Ninguna queda con el panel pelado: `check-emblem` es el genérico de las que no tienen
  // ilustración propia. NO se puede afirmar CUÁL emblema le toca a cada una — bajo vitest TODOS
  // los `.svg` resuelven al mismo stub (`vitest.config.ts`), así que comparar identidades pasaría
  // por la razón equivocada. Eso se verifica en device.
  test("toda vertical tiene emblema", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.art).toBeDefined();
    }
  });

  // El corte del título es DATO, no wrap automático: sin esto RN parte por donde entra y escupe
  // «Supermar / ket».
  test("el título se parte donde lo parte el diseño", () => {
    const bySlug = Object.fromEntries(VERTICALS.map((v) => [v.id, v.titleLines]));

    expect(bySlug.supermarket).toEqual(["Super", "market"]);
    expect(bySlug.cards).toEqual(["Credit", "Cards"]);
    expect(bySlug.loans).toEqual(["Loans &", "Insurance"]);
  });

  // Ningún título se va a UNA línea larga: medido en simulador, a 30pt no entra en el blanco del
  // card y sale truncado con «…» — un corte sin dónde leer el resto. Dos líneas siempre.
  test("ningún título queda en una sola línea larga", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.titleLines.length).toBeGreaterThan(1);
    }
  });

  // El título completo sobrevive como MARCA aunque el card lo parta: es la etiqueta accesible y el
  // nombre que usa la hoja de «en construcción».
  test("el título de marca no se pierde al partirlo", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.titleLines.join("").replace(/\s/g, "")).toBe(
        vertical.title.replace(/\s/g, ""),
      );
    }
  });
});

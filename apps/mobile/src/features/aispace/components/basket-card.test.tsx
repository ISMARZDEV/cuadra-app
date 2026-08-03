import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// La navegación vive en el contenedor (mismo patrón que agent-message.tsx).
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

import type { BasketCardData } from "../interfaces";
import { BasketCard } from "./basket-card";

const BASKET: BasketCardData = {
  budget: "RD$5,000.00",
  currency: "DOP",
  providers: [
    {
      provider_id: "sirena",
      provider_name: "Sirena",
      total: "RD$4,998.06",
      remaining: "RD$1.94",
      items_count: 32,
      groups_covered: ["Arroz", "Aceite"],
      groups_unavailable: [],
      groups_unaffordable: [],
      is_cheapest: true,
      items: [
        {
          index: 1,
          canonical_product_id: "a1",
          name: "Arroz Pimco Gourmet 10 Lbs",
          brand: "Pimco",
          size: "10 Lb",
          image_url: "https://cdn.example/arroz.jpg",
          url: "https://sirena.com/arroz",
          unit_price: "RD$485.00",
          subtotal: "RD$485.00",
          units: 1,
        },
        {
          index: 2,
          canonical_product_id: "a2",
          name: "Cebolla Roja",
          brand: null,
          size: "Unidad",
          image_url: null,
          url: null,
          unit_price: "RD$47.00",
          subtotal: "RD$47.00",
          units: 1,
        },
      ],
    },
    {
      provider_id: "nacional",
      provider_name: "Nacional",
      total: "RD$4,994.68",
      remaining: "RD$5.32",
      items_count: 30,
      groups_covered: ["Arroz", "Aceite"],
      groups_unavailable: [],
      groups_unaffordable: [],
      is_cheapest: false,
      items: [
        {
          index: 1,
          canonical_product_id: "b1",
          name: "Arroz Pimco Gourmet 10 Lbs",
          brand: "Pimco",
          size: "10 Lb",
          image_url: null,
          url: "https://nacional.com/arroz",
          unit_price: "RD$490.00",
          subtotal: "RD$490.00",
          units: 1,
        },
      ],
    },
  ],
};

describe("BasketCard", () => {
  beforeEach(() => {
    setLanguage("es");
    push.mockClear();
  });

  test("tocar un producto de la canasta lleva a Save", () => {
    render(<BasketCard data={BASKET} />);
    fireEvent.click(screen.getAllByText("Ver lista de productos")[0]!);

    fireEvent.click(screen.getByText("Cebolla Roja"));

    expect(push).toHaveBeenCalledWith("/save");
  });

  test("muestra cada proveedor con su logo", () => {
    render(<BasketCard data={BASKET} />);

    expect(screen.getByLabelText("Sirena")).toBeInTheDocument();
    expect(screen.getByLabelText("Nacional")).toBeInTheDocument();
    expect(screen.queryByText("RD$5,000.00")).toBeNull(); // no header de presupuesto
  });

  test("la mejor canasta aparece de primera", () => {
    render(<BasketCard data={BASKET} />);

    const providers = screen.getAllByLabelText(/Sirena|Nacional/);
    expect(providers[0]).toHaveAccessibleName("Sirena");
  });

  test("los productos están ocultos hasta presionar Ver lista de productos", () => {
    render(<BasketCard data={BASKET} />);

    expect(screen.queryByText("Arroz Pimco Gourmet 10 Lbs")).toBeNull();

    const trigger = screen.getAllByText("Ver lista de productos")[0];
    fireEvent.click(trigger);

    expect(screen.getByText("Arroz Pimco Gourmet 10 Lbs")).toBeInTheDocument();
    expect(screen.getByText("Cebolla Roja")).toBeInTheDocument();
  });

  test("marca la canasta más barata", () => {
    render(<BasketCard data={BASKET} />);

    expect(screen.getByText("Mejor canasta")).toBeInTheDocument();
  });

  test("muestra precio con punto decimal, centavos arriba y etiqueta de unidad", () => {
    render(<BasketCard data={BASKET} />);

    const trigger = screen.getAllByText("Ver lista de productos")[0];
    fireEvent.click(trigger);

    // Point stays on the baseline; cents are rendered as a separate superscript node.
    expect(screen.getByText("$485.")).toBeInTheDocument();
    expect(screen.getAllByText("00").length).toBeGreaterThanOrEqual(2);

    // Cebolla Roja is a single unit.
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes("X UND") ?? false).length,
    ).toBeGreaterThanOrEqual(2);

    // Arroz Pimco Gourmet 10 Lbs → RD$485.00 / 10 = $48.50 X Lb.
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes("$48.50 X Lb") ?? false)
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("el chrome se localiza", () => {
    setLanguage("en");
    render(<BasketCard data={BASKET} />);

    expect(screen.getByText("Best basket")).toBeInTheDocument();
    expect(screen.getAllByText("View product list").length).toBe(2);
  });
});

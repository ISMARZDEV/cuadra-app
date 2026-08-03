import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

import type { ProviderProductsData } from "../interfaces";
import { ProviderProductsCard } from "./provider-products-card";

const PROVIDER_PRODUCTS: ProviderProductsData = {
  currency: "DOP",
  providers: [
    {
      provider_id: "nacional",
      provider_name: "Nacional",
      items: [
        {
          index: 1,
          canonical_product_id: "n1",
          name: "Dog Chow Adulto 8 Lb",
          brand: "Purina",
          size: "8 Lb",
          image_url: "https://cdn.example/dogchow.jpg",
          url: "https://nacional.com/dogchow",
          unit_price: "RD$1,250.00",
        },
        {
          index: 2,
          canonical_product_id: "n2",
          name: "Pedigree Adulto",
          brand: "Pedigree",
          size: "4 Lb",
          image_url: null,
          url: null,
          unit_price: "RD$780.00",
        },
      ],
    },
    {
      provider_id: "bravo",
      provider_name: "Bravo",
      items: [
        {
          index: 1,
          canonical_product_id: "b1",
          name: "Croquetas Ricocan",
          brand: "Ricocan",
          size: "Unidad",
          image_url: null,
          url: "https://bravo.com/ricocan",
          unit_price: "RD$350.00",
        },
      ],
    },
  ],
};

describe("ProviderProductsCard", () => {
  beforeEach(() => {
    setLanguage("es");
    push.mockClear();
  });

  test("tocar un producto lleva a Save", () => {
    render(<ProviderProductsCard data={PROVIDER_PRODUCTS} />);

    fireEvent.click(screen.getByText("Pedigree Adulto"));

    expect(push).toHaveBeenCalledWith("/save");
  });

  test("muestra cada proveedor con su logo", () => {
    render(<ProviderProductsCard data={PROVIDER_PRODUCTS} />);

    expect(screen.getByLabelText("Nacional")).toBeInTheDocument();
    expect(screen.getByLabelText("Bravo")).toBeInTheDocument();
  });

  test("renderiza los productos directamente sin colapsar", () => {
    render(<ProviderProductsCard data={PROVIDER_PRODUCTS} />);

    expect(screen.getByText("Dog Chow Adulto 8 Lb")).toBeInTheDocument();
    expect(screen.getByText("Pedigree Adulto")).toBeInTheDocument();
    expect(screen.getByText("Croquetas Ricocan")).toBeInTheDocument();
  });

  test("formatea precios y etiquetas de unidad", () => {
    render(<ProviderProductsCard data={PROVIDER_PRODUCTS} />);

    // Dog Chow 1250 / 8 = $156.25 X Lb
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("$156.25 X Lb") ?? false,
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // Unidad → X UND
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("X UND") ?? false,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("no muestra totales ni etiquetas de canasta", () => {
    render(<ProviderProductsCard data={PROVIDER_PRODUCTS} />);

    expect(screen.queryByText("Mejor canasta")).toBeNull();
    expect(screen.queryByText("Ver lista de productos")).toBeNull();
  });
});

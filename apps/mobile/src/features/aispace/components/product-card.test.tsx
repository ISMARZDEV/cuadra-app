import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { setLanguage } from "@/i18n";

import { ProductCard } from "./product-card";

// La comparación se pinta DENTRO de la burbuja: mandar al navegador abandona la conversación, y
// comparar precios es justo lo que el usuario vino a hacer.
const CAFE = {
  name: "Café Molido Santo Domingo 1 Lb",
  brand: "Santo Domingo",
  image_url: "https://cdn.example/cafe.jpg",
  captured_at: "2026-08-02",
  stores: [
    { provider: "Sirena", price: "RD$472.67", is_cheapest: true },
    { provider: "Nacional", price: "RD$478.00", is_cheapest: false },
    { provider: "Bravo", price: "RD$487.73", is_cheapest: false },
  ],
};

describe("ProductCard", () => {
  // El entorno de test resuelve `en` por Intl; el chrome de la tarjeta se afirma en español, así
  // que hay que fijarlo. Que haga falta es la prueba de que la etiqueta SÍ pasa por i18n.
  beforeEach(() => setLanguage("es"));

  test("el chrome cambia con el idioma — no está hardcodeado", () => {
    setLanguage("en");
    render(<ProductCard data={CAFE} />);
    expect(screen.getByText("Cheapest")).toBeInTheDocument();

    setLanguage("pt");
    render(<ProductCard data={CAFE} />);
    expect(screen.getByText("Mais barato")).toBeInTheDocument();
  });

  test("muestra el producto y una fila por tienda con su precio", () => {
    render(<ProductCard data={CAFE} />);

    expect(screen.getByText("Café Molido Santo Domingo 1 Lb")).toBeInTheDocument();
    for (const s of CAFE.stores) {
      expect(screen.getByText(s.provider)).toBeInTheDocument();
      expect(screen.getByText(s.price)).toBeInTheDocument();
    }
  });

  test("marca la tienda más barata, y sólo esa", () => {
    render(<ProductCard data={CAFE} />);

    // La palabra la pone el CLIENTE (i18n); el backend sólo manda el booleano.
    expect(screen.getAllByText("Más barato")).toHaveLength(1);
  });

  test("con UNA sola tienda no marca nada como lo más barato", () => {
    // §8.1 fila 2: sin con qué comparar, «el más barato» es una afirmación falsa.
    render(
      <ProductCard
        data={{ ...CAFE, stores: [{ provider: "Sirena", price: "RD$472.67", is_cheapest: false }] }}
      />,
    );

    expect(screen.queryByText("Más barato")).toBeNull();
  });

  test("cita la fecha de captura y el disclaimer", () => {
    // §8.2 — sin esto el usuario no puede detectar que el dato está viejo.
    render(<ProductCard data={CAFE} />);

    expect(screen.getByText(/2026-08-02/)).toBeInTheDocument();
    expect(screen.getByText(/tienda/)).toBeInTheDocument();
  });

  test("sin foto no se rompe", () => {
    render(<ProductCard data={{ ...CAFE, image_url: null }} />);

    expect(screen.getByText("Café Molido Santo Domingo 1 Lb")).toBeInTheDocument();
  });
});

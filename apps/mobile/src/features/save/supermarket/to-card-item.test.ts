import { describe, expect, test } from "vitest";
import type { ProductCardDto } from "@cuadra/api-client";

import { toCardItemView } from "./to-card-item";

// Lo que se prueba acá es la TRADUCCIÓN del DTO a la tarjeta. El layout del carrusel y el gesto de
// la tarjeta no se pueden ejercitar bajo jsdom, así que todo lo que puede fallar en silencio se
// concentró en esta función pura y se prueba de verdad.

function dto(over: Partial<ProductCardDto> = {}): ProductCardDto {
  return {
    id: "p-1",
    slug: "carne-premium-angus",
    name: "Carne Premium Angus de Res",
    brand: "FRANC'S",
    display_size: "2.0 kg",
    image_url: "http://img/carne.jpg",
    price_minor: 44200,
    currency: "DOP",
    unit_price_minor: 22100,
    unit_measure: "mass",
    store_count: 8,
    ...over,
  };
}

test("el dinero se formatea desde minor units", () => {
  const view = toCardItemView(dto(), 0);

  // 44200 minor = $442.00 — nunca llega un float desde la API.
  expect(view.item.unit_price).toBe("$442.00");
});

test("el círculo muestra en cuántas tiendas está, NO la posición", () => {
  // La distinción importa: en la canasta del chat el círculo es la posición, y acá reusamos la
  // misma tarjeta. Con `index` de 0 y `store_count` de 8, un badge de 1 delataría el cableado
  // equivocado — y en pantalla se vería como un número plausible.
  const view = toCardItemView(dto({ store_count: 8 }), 0);

  expect(view.badge).toBe(8);
  expect(view.item.index).toBe(1); // la posición sigue viajando, pero no es lo que se pinta
});

test("el precio anterior se formatea cuando el producto está en oferta", () => {
  const view = toCardItemView(dto({ previous_price_minor: 52000, discount_bps: 1500 }), 0);

  expect(view.previousPrice).toBe("$520.00");
  expect(view.discountBps).toBe(1500);
});

test("sin oferta no hay precio anterior ni descuento", () => {
  const view = toCardItemView(dto(), 0);

  // `null` es «no hay dato». Un 0 sería «costaba cero» y pintaría un tachado de $0.00.
  expect(view.previousPrice).toBeNull();
  expect(view.discountBps).toBeNull();
});

test("el tamaño de la tarjeta sale de `display_size`", () => {
  const view = toCardItemView(dto({ display_size: "2.0 kg" }), 0);

  expect(view.item.size).toBe("2.0 kg");
});

test("en esta pantalla la tarjeta no lleva enlace a la tienda", () => {
  // La esquina la ocupa el marcador para seguir el precio; con `url` la tarjeta pintaría el ojo y
  // habría dos acciones peleando por el mismo lugar.
  const view = toCardItemView(dto(), 0);

  expect(view.item.url).toBeNull();
});

test("un producto sin imagen ni tamaño no rompe la traducción", () => {
  const view = toCardItemView(dto({ image_url: null, display_size: null }), 3);

  expect(view.item.image_url).toBeNull();
  expect(view.item.size).toBeNull();
  expect(view.item.name).toBe("Carne Premium Angus de Res");
});

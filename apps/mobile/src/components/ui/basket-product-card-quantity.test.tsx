import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import BasketProductCard, { type ProductListItemData } from "./basket-product-card";

/**
 * La cantidad CONTROLADA y el «+» como interruptor.
 *
 * Existe porque la rejilla de Supermarket usa la cantidad para representar la pertenencia a la
 * canasta de COMPARACIÓN, que vive en un store fuera del card. Con estado local, volver a la
 * pantalla remontaba las tarjetas a cero mientras la canasta seguía llena — dos verdades distintas
 * sobre lo mismo en la misma pantalla.
 */
// `index: 7` y no 1: el número del círculo se dibuja como texto, y con un 1 ahí las aserciones
// sobre la cantidad encontrarían DOS «1» y pasarían por el motivo equivocado.
const item: ProductListItemData = {
  index: 7,
  canonical_product_id: "c1",
  name: "Arroz Selecto",
  brand: "Líder",
  size: "10 lb",
  unit_price: "169.00",
};

// El arnés de tests corre el i18n en INGLÉS, así que la etiqueta es la de `en.json`.
const add = () => screen.getByLabelText("Add");

describe("BasketProductCard — cantidad", () => {
  test("sin la prop, la lleva por dentro: al tocar «+» aparece el 1", () => {
    // Es lo que quiere la canasta del chat, y NO puede cambiar por lo que necesite la rejilla.
    render(<BasketProductCard item={item} currency="DOP" />);

    fireEvent.click(add());

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // ⚠️ Este par de tests cubre DOS mecanismos distintos y hay que romperlos por separado: éste
  // falla si se quita la guarda del estado local, y el de «montar con cantidad ya puesta» falla si
  // se quita el `??` que hace ganar a la prop. Probado: romper sólo la guarda dejaba los cuatro en
  // verde, porque el `??` tapaba el defecto. Un test que pasa por el motivo equivocado no protege.
  test("con la prop, MANDA el padre: el card no se contradice con el store", () => {
    render(<BasketProductCard item={item} currency="DOP" quantity={0} onQuantityChange={vi.fn()} />);

    fireEvent.click(add());

    // Sigue en 0 porque el padre no lo movió. Sin esto el card pintaría un 1 que el store no tiene.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  test("el «+» avisa del cambio — es el INTERRUPTOR de la canasta", () => {
    const onQuantityChange = vi.fn();
    render(
      <BasketProductCard item={item} currency="DOP" quantity={0} onQuantityChange={onQuantityChange} />,
    );

    fireEvent.click(add());

    expect(onQuantityChange).toHaveBeenCalledWith(1);
  });

  test("montar con cantidad ya puesta dibuja los controles, no el «+»", () => {
    // El caso que motivó todo: se vuelve del detalle y el producto SIGUE en la canasta.
    render(<BasketProductCard item={item} currency="DOP" quantity={1} onQuantityChange={vi.fn()} />);

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

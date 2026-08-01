import { describe, expect, it } from "vitest";

import { DISCOUNT_FLOOR, priceDrop } from "./price-drop";

describe("priceDrop", () => {
  it("sin precio anterior no hay bajada que contar", () => {
    expect(priceDrop(7400, null)).toBeNull();
    expect(priceDrop(7400, undefined)).toBeNull();
  });

  // Una SUBIDA no es un descuento. Tacharla igual convertiría "$74 → $95" en un gancho de
  // oferta cuando el producto se encareció: exactamente al revés de lo que pasó.
  it("una subida no es una bajada", () => {
    expect(priceDrop(9500, 7400)).toBeNull();
  });

  it("el mismo precio no es una bajada", () => {
    expect(priceDrop(7400, 7400)).toBeNull();
  });

  it("calcula el porcentaje sobre el precio ANTERIOR", () => {
    // 9500 → 7400 son 2100 sobre 9500 = 22.1%. Sobre el precio nuevo daría 28% y sería mentira:
    // el descuento siempre se mide contra lo que costaba antes.
    const drop = priceDrop(7400, 9500);
    expect(drop).not.toBeNull();
    expect(drop?.percent).toBe(22);
  });

  it("una bajada chica se muestra pero NO se destaca", () => {
    // 9% queda por debajo del piso: la UI muestra el tachado, no el círculo rojo.
    const drop = priceDrop(9100, 10000);
    expect(drop?.percent).toBe(9);
    expect(drop?.significant).toBe(false);
  });

  it("el piso del 10% entra, no queda afuera", () => {
    const drop = priceDrop(9000, 10000);
    expect(drop?.percent).toBe(10);
    expect(drop?.significant).toBe(true);
  });

  it("una bajada grande se destaca", () => {
    expect(priceDrop(7400, 9500)?.significant).toBe(true);
  });

  it("el piso es del 10%", () => {
    expect(DISCOUNT_FLOOR).toBe(0.1);
  });

  it("un precio anterior de cero no revienta ni inventa un infinito", () => {
    // Dividir por cero daría Infinity y la UI pintaría "-Infinity%".
    expect(priceDrop(7400, 0)).toBeNull();
  });
});

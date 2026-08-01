import type { AdminCanonicalProviderPriceDto } from "@cuadra/api-client";
import { describe, expect, it } from "vitest";

import { providerStats, rowStanding } from "./provider-stats";

function p(over: Partial<AdminCanonicalProviderPriceDto>): AdminCanonicalProviderPriceDto {
  return {
    provider_id: "p",
    provider_name: "X",
    store_product_id: "sp",
    price_minor: 7400,
    currency: "DOP",
    is_cheapest: false,
    ...over,
  } as AdminCanonicalProviderPriceDto;
}

describe("providerStats", () => {
  it("sin tiendas no hay estadística que mostrar", () => {
    expect(providerStats([])).toBeNull();
  });

  it("saca mínimo, máximo, diferencia y cuántas tiendas", () => {
    const stats = providerStats([
      p({ price_minor: 7400, is_cheapest: true }),
      p({ price_minor: 7500 }),
      p({ price_minor: 7695 }),
    ]);

    expect(stats).toEqual({
      minMinor: 7400,
      maxMinor: 7695,
      spreadMinor: 295,
      activeCount: 3,
      currency: "DOP",
    });
  });

  // El mockup mostraba "Precio más alto RD$76.00" con la fila más cara en RD$75.00 y una
  // "Diferencia" de RD$1.00 que no se correspondía con ninguno de los dos. Los tres salen del
  // MISMO arreglo para que no puedan volver a discrepar.
  it("la diferencia es exactamente máximo menos mínimo", () => {
    const stats = providerStats([p({ price_minor: 7400 }), p({ price_minor: 7500 })]);
    expect(stats?.spreadMinor).toBe(stats!.maxMinor - stats!.minMinor);
  });

  it("con una sola tienda la diferencia es cero, no un hueco", () => {
    const stats = providerStats([p({ price_minor: 7400 })]);
    expect(stats?.spreadMinor).toBe(0);
    expect(stats?.activeCount).toBe(1);
  });
});

describe("rowStanding", () => {
  const rows = [
    p({ provider_id: "a", price_minor: 7400, is_cheapest: true }),
    p({ provider_id: "b", price_minor: 7500 }),
    p({ provider_id: "c", price_minor: 7695 }),
  ];
  const stats = providerStats(rows)!;

  it("la más barata es el mejor precio", () => {
    expect(rowStanding(rows[0], stats)).toEqual({ kind: "cheapest", deltaMinor: 0 });
  });

  it("la más cara se marca como tal y dice cuánto más cuesta", () => {
    expect(rowStanding(rows[2], stats)).toEqual({ kind: "priciest", deltaMinor: 295 });
  });

  it("las del medio sólo dicen cuánto más cuestan", () => {
    expect(rowStanding(rows[1], stats)).toEqual({ kind: "middle", deltaMinor: 100 });
  });

  // Con empate en el mínimo, "la más cara" no existe: marcar una de las dos sería arbitrario.
  it("si todas empatan, ninguna es la más cara", () => {
    const tied = [
      p({ provider_id: "a", price_minor: 7400, is_cheapest: true }),
      p({ provider_id: "b", price_minor: 7400, is_cheapest: true }),
    ];
    const s = providerStats(tied)!;
    expect(rowStanding(tied[0], s).kind).toBe("cheapest");
    expect(rowStanding(tied[1], s).kind).toBe("cheapest");
  });
});

import { describe, expect, it } from "vitest";

import {
  type CanonicalProductsParams,
  countActiveFilters,
  parseCanonicalProductsParams,
  serializeCanonicalProductsParams,
} from "./canonical-products-params";

// El par parse/serialize es lo que hace el estado COMPARTIBLE por link (US-CP-L2): copiar la URL
// y pegarla tiene que reproducir exactamente el mismo filtro y la misma página.

describe("parseCanonicalProductsParams", () => {
  it("una URL vacía cae en los defaults", () => {
    const params = parseCanonicalProductsParams({});
    expect(params).toEqual({
      search: undefined,
      brand_id: undefined,
      taxonomy_node_id: undefined,
      quality_status: undefined,
      ean_reachable: undefined,
      min_provider_count: undefined,
      updated_since: undefined,
      sort: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("lee todos los filtros de la query", () => {
    const params = parseCanonicalProductsParams({
      search: "arroz",
      quality_status: "no_image",
      ean_reachable: "true",
      min_provider_count: "3",
      updated_since: "2026-07-01",
      sort: "-completeness",
      limit: "50",
      offset: "100",
    });
    expect(params.search).toBe("arroz");
    expect(params.quality_status).toBe("no_image");
    expect(params.ean_reachable).toBe(true);
    expect(params.min_provider_count).toBe(3);
    expect(params.sort).toBe("-completeness");
    expect(params.limit).toBe(50);
    expect(params.offset).toBe(100);
  });

  it("`ean_reachable=false` es un filtro REAL, no la ausencia de filtro", () => {
    expect(parseCanonicalProductsParams({ ean_reachable: "false" }).ean_reachable).toBe(false);
  });

  it("un limit basura pegado a mano cae al default en vez de propagar NaN", () => {
    // Un `NaN` acá se convierte en `?limit=NaN` hacia la API y en una división por NaN en la
    // paginación: la pantalla se rompe entera por un carácter en la URL.
    expect(parseCanonicalProductsParams({ limit: "abc" }).limit).toBe(20);
    expect(parseCanonicalProductsParams({ offset: "-5" }).offset).toBe(0);
  });
});

describe("serializeCanonicalProductsParams", () => {
  const base: CanonicalProductsParams = { limit: 20, offset: 0 };

  it("sin filtros no escribe querystring — links limpios", () => {
    expect(serializeCanonicalProductsParams(base).toString()).toBe("");
  });

  it("sólo escribe lo que difiere del default", () => {
    const qs = serializeCanonicalProductsParams({ ...base, search: "arroz", limit: 50 });
    expect(qs.get("search")).toBe("arroz");
    expect(qs.get("limit")).toBe("50");
    expect(qs.get("offset")).toBeNull();
  });

  it("no escribe el orden por defecto", () => {
    expect(serializeCanonicalProductsParams({ ...base, sort: "name" }).toString()).toBe("");
    expect(serializeCanonicalProductsParams({ ...base, sort: "-updated" }).get("sort")).toBe(
      "-updated",
    );
  });

  it("es inversa de parse: round-trip preserva el estado", () => {
    const original: CanonicalProductsParams = {
      search: "goya",
      quality_status: "stale_price",
      ean_reachable: false,
      min_provider_count: 2,
      updated_since: "2026-07-01",
      sort: "-completeness",
      limit: 50,
      offset: 50,
      brand_id: undefined,
      taxonomy_node_id: undefined,
    };
    const qs = serializeCanonicalProductsParams(original);
    const roundTripped = parseCanonicalProductsParams(Object.fromEntries(qs.entries()));
    expect(roundTripped).toEqual(original);
  });
});

describe("countActiveFilters", () => {
  it("la búsqueda y la paginación NO cuentan como filtros", () => {
    // El badge del embudo cuenta lo que está DENTRO del modal; si contara la búsqueda, el
    // operador vería un filtro activo que no puede limpiar desde ahí.
    expect(countActiveFilters({ limit: 20, offset: 40, search: "arroz" })).toBe(0);
  });

  it("cuenta cada filtro del modal", () => {
    expect(
      countActiveFilters({
        limit: 20,
        offset: 0,
        quality_status: "no_image",
        ean_reachable: true,
        min_provider_count: 3,
      }),
    ).toBe(3);
  });

  it("`ean_reachable=false` cuenta como filtro activo", () => {
    expect(countActiveFilters({ limit: 20, offset: 0, ean_reachable: false })).toBe(1);
  });
});

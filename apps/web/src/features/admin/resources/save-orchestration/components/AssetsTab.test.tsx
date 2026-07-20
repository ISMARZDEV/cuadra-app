import type { AssetAdminRowDto } from "@cuadra/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listPipelineAssets: vi.fn(),
  AssetsUnavailable: class extends Error {},
}));
vi.mock("../api", () => api);

import { AssetsTab } from "./AssetsTab";

function asset(over: Partial<AssetAdminRowDto> = {}): AssetAdminRowDto {
  return {
    key: "query_catalog_prices",
    group: "default",
    description: "Descubrimiento por-query",
    job_names: ["save_query_catalog"],
    partitions: null,
    last_materialized_at: null,
    last_run_id: null,
    health: "never_materialized",
    ...over,
  } as AssetAdminRowDto;
}

function setup(assets: AssetAdminRowDto[]) {
  api.listPipelineAssets.mockResolvedValue(assets);
  render(<AssetsTab t={(k: string) => k} locale="es" />);
}

beforeEach(() => {
  api.listPipelineAssets.mockReset();
});

describe("AssetsTab — el browse REST de Bravo por fin es visible", () => {
  it("shows a partitioned asset as ONE row with its aggregate, not one row per section", async () => {
    // US-OR-L4 lo pide explícito. `rest_catalog_prices` tiene 40+ secciones: una fila por partición
    // ahogaría la tabla y escondería los otros 7 assets.
    setup([
      asset({
        key: "rest_catalog_prices",
        partitions: { total: 40, materialized: 32, failed: 0, materializing: 0, coverage_ratio: 0.8, kind: "section" },
        last_materialized_at: "2026-07-20T04:00:00+00:00",
        health: "healthy",
      }),
    ]);

    expect(await screen.findByText("rest_catalog_prices")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2); // cabecera + 1
    expect(screen.getByTestId("asset-partitions-rest_catalog_prices")).toHaveTextContent("32");
  });

  it("renders NO partition indicator for a non-partitioned asset", async () => {
    // `null` != `0 de 0`. Un `0/0` afirmaría una cobertura del 0% sobre algo que no tiene cobertura.
    setup([asset({ key: "embed_canonicals", partitions: null })]);

    await screen.findByText("embed_canonicals");
    expect(screen.queryByTestId("asset-partitions-embed_canonicals")).not.toBeInTheDocument();
  });

  it("distinguishes NEVER materialized from broken", async () => {
    // La distinción que costó cara en F4: "nunca corrió" no es "está roto". Fusionarlas pintaría un
    // deploy nuevo entero en rojo estando sano.
    setup([asset({ health: "never_materialized" })]);

    expect(await screen.findByTestId("asset-health-query_catalog_prices")).toHaveTextContent(
      "admin.orchestration.assets.health.never_materialized",
    );
  });

  it("declares that it could NOT ask instead of showing an empty pipeline", async () => {
    // La mentira más cara del módulo. Un estado vacío diría "el pipeline no tiene assets" cuando el
    // runner simplemente no respondió.
    api.listPipelineAssets.mockRejectedValue(new Error("boom"));
    render(<AssetsTab t={(k: string) => k} locale="es" />);

    expect(await screen.findByTestId("assets-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("assets-empty")).not.toBeInTheDocument();
  });

  it("an EMPTY pipeline is a different message from an unreachable one", async () => {
    setup([]);

    expect(await screen.findByTestId("assets-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("assets-unavailable")).not.toBeInTheDocument();
  });

  it("paginates instead of dumping every asset in one page", async () => {
    setup(Array.from({ length: 12 }, (_, i) => asset({ key: `asset_${i}` })));

    await screen.findByText("asset_0");

    // 10 filas + la cabecera. La 11ª y 12ª quedan en la página 2.
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.queryByText("asset_10")).not.toBeInTheDocument();
  });

  it("counts the range over the REAL total, not over the visible page", async () => {
    setup(Array.from({ length: 12 }, (_, i) => asset({ key: `asset_${i}` })));

    expect(await screen.findByTestId("assets-pagination-range")).toHaveTextContent("1–10 de 12");
  });

  it("names WHAT the parts are — `2/41` alone is a number without a subject", async () => {
    // El operador preguntó literalmente "no entiendo esas dos". El tipo de partición lo declara el
    // runner (`partitionDefinition.name`) y lo traduce el dominio; acá solo se elige la palabra.
    setup([
      asset({
        key: "rest_catalog_prices",
        partitions: {
          total: 41, materialized: 2, failed: 0, materializing: 0,
          coverage_ratio: 0.05, kind: "section",
        },
      }),
    ]);

    expect(await screen.findByTestId("asset-partitions-rest_catalog_prices")).toHaveTextContent(
      "admin.orchestration.assets.partsSection",
    );
  });

  it("falls back to a generic noun for an unmapped partition instead of guessing", async () => {
    setup([
      asset({
        partitions: {
          total: 2, materialized: 1, failed: 0, materializing: 0,
          coverage_ratio: 0.5, kind: "algo_nuevo",
        },
      }),
    ]);

    expect(await screen.findByTestId("asset-partitions-query_catalog_prices")).toHaveTextContent(
      "admin.orchestration.assets.partsOther",
    );
  });

  it("explains what a partition IS — the header carries the help affordance", async () => {
    // `3/4` no dice de qué son esas partes. Sin esto el número es un dato sin significado.
    setup([asset()]);

    expect(await screen.findByTestId("partitions-help")).toBeInTheDocument();
  });

  it("does not ask the runner until the tab is actually rendered", async () => {
    setup([asset()]);
    await waitFor(() => expect(api.listPipelineAssets).toHaveBeenCalledTimes(1));
  });
});

import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody } from "@/components/ui-base/table";

import { CanonicalProductRow } from "./CanonicalProductRow";

vi.mock("vike/client/router", () => ({ navigate: vi.fn() }));

const ROW: AdminCanonicalProductRowDto = {
  canonical_product_id: "11111111-1111-4111-8111-111111111111",
  slug: "arroz-goya-10-lb",
  name: "Arroz Goya 10 Lb",
  brand: "GOYA",
  display_size: "10 Lb",
  size_amount: "10" as never,
  size_measure: "mass",
  image_url: null,
  category: "Arroz",
  taxonomy_node_id: null,
  quality: "premium",
  ean_reachable: true,
  origin_run_id: null,
  matched_provider_count: 3,
  possible_duplicate_count: 0,
  last_price_seen_at: "2026-07-20T10:00:00Z",
  last_match_at: null,
  quality_statuses: ["complete"],
  completeness_score: 100,
};

function renderRow(overrides: Partial<AdminCanonicalProductRowDto> = {}) {
  return render(
    <Table>
      <TableBody>
        <CanonicalProductRow
          row={{ ...ROW, ...overrides }}
          locale="es"
          onViewProviders={vi.fn()}
          onEdit={vi.fn()}
          onArchive={vi.fn()}
          onUnarchive={vi.fn()}
          publicHref="/es/do/save/producto/arroz-goya-10-lb"
        />
      </TableBody>
    </Table>,
  );
}

describe("CanonicalProductRow", () => {
  it("traduce los estados de calidad en vez de mostrar la clave del backend", () => {
    // Mostrarle `no_image` a un operador es filtrar un identificador de sistema a la UI.
    renderRow({ quality_statuses: ["no_image", "no_category"] });

    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
    expect(screen.queryByText("no_image")).not.toBeInTheDocument();
  });

  it("cada estado explica QUÉ falta en su tooltip", () => {
    renderRow({ quality_statuses: ["no_providers"] });

    expect(screen.getByText("Sin tiendas")).toHaveAttribute(
      "title",
      expect.stringContaining("Ninguna tienda"),
    );
  });

  it("un estado desconocido se muestra crudo en vez de desaparecer", () => {
    // Si el backend agrega un estado nuevo, la fila tiene que seguir diciendo algo — que el
    // badge se borre en silencio le escondería trabajo real al operador.
    renderRow({ quality_statuses: ["un_estado_nuevo"] });

    expect(screen.getByText("un_estado_nuevo")).toBeInTheDocument();
  });

  it("muestra el badge EAN cuando el canónico es alcanzable por código de barras", () => {
    renderRow({ ean_reachable: true });
    expect(screen.getByText("EAN")).toBeInTheDocument();
  });

  it("sin EAN no pinta el badge", () => {
    renderRow({ ean_reachable: false });
    expect(screen.queryByText("EAN")).not.toBeInTheDocument();
  });

  it("muestra el nº de tiendas sobre la imagen", () => {
    renderRow({ matched_provider_count: 7 });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("traduce las etiquetas al locale del admin", () => {
    render(
      <Table>
        <TableBody>
          <CanonicalProductRow
            row={{ ...ROW, quality_statuses: ["no_image"] }}
            locale="en"
            onViewProviders={vi.fn()}
            onEdit={vi.fn()}
            onArchive={vi.fn()}
            onUnarchive={vi.fn()}
            publicHref={null}
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("No image")).toBeInTheDocument();
  });

  it("muestra el slug bajo el nombre", () => {
    renderRow();
    expect(screen.getByText("arroz-goya-10-lb")).toBeInTheDocument();
  });

  it("una fecha nula sale como guion y no como 'Invalid Date'", () => {
    renderRow({ last_price_seen_at: null });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});


describe("CanonicalProductRow · archivado", () => {
  it("un canónico archivado muestra su badge", () => {
    renderRow({ archived_at: "2026-07-25T10:00:00Z" });
    expect(screen.getByText("Archivado")).toBeInTheDocument();
  });

  it("un canónico activo no muestra el badge", () => {
    renderRow({ archived_at: null });
    expect(screen.queryByText("Archivado")).not.toBeInTheDocument();
  });
});

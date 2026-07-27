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
  category_top: "Despensa & Abarrotes",
  category_top_slug: "despensa-abarrotes",
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


describe("CanonicalProductRow · Tamaño y Peso", () => {
  // Mismo lenguaje visual que `ReviewRow` de la Cola de revisión: el número y la unidad viajan
  // en DOS columnas con sus dos píldoras, en vez de apilarse en una sola celda.
  it("parte el tamaño en dos píldoras, número y unidad", () => {
    renderRow({ display_size: "330 Ml" });

    expect(screen.getByText("330")).toHaveClass("bg-[#007e62]");
    expect(screen.getByText("Ml")).toHaveClass("bg-brand-lime");
  });

  // `size_measure` es vocabulario del DOMINIO (mass/volume/count). Traducido a "Masa" sigue sin
  // decirle nada al operador que ya está leyendo "10" y "Lb" al lado.
  it("no muestra la medida del dominio ('Masa') bajo el tamaño", () => {
    renderRow({ size_measure: "mass", display_size: "10 Lb" });

    expect(screen.queryByText("Masa")).not.toBeInTheDocument();
  });

  it("sin tamaño ambas columnas caen a guion", () => {
    renderRow({ display_size: null });

    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("CanonicalProductRow · Categoría", () => {
  // El mapa de colores del admin está cargado por slug de TOPE. Pasarle el nombre de la hoja
  // (el bug anterior) hacía que NINGUNA categoría resolviera color y todos los badges salieran
  // grises.
  it("colorea el badge con el slug del tope, no con el nombre de la hoja", () => {
    renderRow();

    const badge = screen.getByText("Despensa & Abarrotes");
    expect(badge).toHaveStyle({ backgroundColor: "#edfff2" });
  });

  it("muestra la hoja debajo del badge para no perder especificidad", () => {
    renderRow();

    expect(screen.getByText("Arroz")).toBeInTheDocument();
  });

  it("sin clasificar cae al badge neutro y no inventa hoja", () => {
    renderRow({ category: null, category_top: null, category_top_slug: null });

    expect(screen.getByText("Sin categoría")).toBeInTheDocument();
    expect(screen.queryByText("Arroz")).not.toBeInTheDocument();
  });

  // Nodo level-0 defensivo: el backend hace COALESCE a la hoja, así que hoja === tope. Repetir
  // el mismo texto dos veces se lee como un bug de render.
  it("no repite el texto cuando la hoja ES el tope", () => {
    renderRow({ category: "Bebés", category_top: "Bebés", category_top_slug: "bebes" });

    expect(screen.getAllByText("Bebés")).toHaveLength(1);
  });

  it("un slug desconocido no rompe: cae al neutro sin perder la etiqueta", () => {
    renderRow({ category_top: "Categoría Nueva", category_top_slug: "categoria-nueva" });

    expect(screen.getByText("Categoría Nueva")).toHaveStyle({ backgroundColor: "#f1f5f4" });
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

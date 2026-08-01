import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalProductsData } from "../interfaces";

let mockData: CanonicalProductsData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
vi.mock("vike/client/router", () => ({ navigate: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const resolveCanonicalBrands = vi.fn().mockResolvedValue(null);
vi.mock("../api", () => ({
  archiveCanonicalProduct: vi.fn(),
  listCanonicalProducts: vi.fn().mockResolvedValue(null),
  resolveCanonicalBrands: (...args: unknown[]) => resolveCanonicalBrands(...args),
  unarchiveCanonicalProduct: vi.fn(),
}));

import { CanonicalProductsScreen } from "./CanonicalProductsScreen";

function row(overrides: Partial<AdminCanonicalProductRowDto> = {}): AdminCanonicalProductRowDto {
  return {
    canonical_product_id: "c1",
    slug: "albahaca-verde-1-2-lb",
    name: "ALBAHACA VERDE 1/2 LB",
    brand: "",
    size_amount: "2" as unknown as number,
    size_measure: "mass",
    quality_statuses: [],
    completeness_score: 0,
    matched_provider_count: 0,
    possible_duplicate_count: 0,
    ...overrides,
  } as AdminCanonicalProductRowDto;
}

/** El menú "Acciones" de esta consola tiene que verse EXACTAMENTE igual que el de la Cola de
 *  revisión (`ReviewQueueToolbar`): son dos consolas hermanas y el operador salta de una a otra.
 *
 *  Ya divergieron una vez —los ítems se partían en dos líneas y salían en gris en vez de violeta—
 *  y nadie lo detectó hasta que se comparó a ojo. Esto lo fija. */
describe("CanonicalProductsScreen — menú Acciones", () => {
  beforeEach(() => {
    resolveCanonicalBrands.mockClear();
    mockData = {
      list: { rows: [row()], total: 1 } as CanonicalProductsData["list"],
      params: {} as CanonicalProductsData["params"],
      taxonomyLeaves: [],
      locale: "es",
    };
  });

  function openMenu() {
    // el checkbox de fila se identifica por `aria-label` (el nombre del producto), no por testid
    fireEvent.click(screen.getByLabelText("ALBAHACA VERDE 1/2 LB"));
    fireEvent.click(screen.getByTestId("canonical-bulk-actions"));
  }

  it("los ítems no se parten en dos líneas (el contenedor fuerza nowrap y un ancho mínimo)", () => {
    render(<CanonicalProductsScreen />);
    openMenu();

    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("min-w-56");
    expect(menu.className).toContain("whitespace-nowrap");
  });

  it("las dos acciones llevan el VIOLETA que el OFV reserva para 'preparar'", () => {
    render(<CanonicalProductsScreen />);
    openMenu();

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    for (const item of items) {
      // el mismo par que usa la Cola de revisión: fondo al enfocar + icono teñido
      expect(item.className).toContain("focus:bg-violet-500/10");
      expect(item.querySelector("svg")?.getAttribute("class")).toContain("text-violet-600");
    }
  });

  it("clasificar marcas manda los ids seleccionados", async () => {
    render(<CanonicalProductsScreen />);
    openMenu();

    fireEvent.click(screen.getByText(/Clasificar marcas/));

    expect(resolveCanonicalBrands).toHaveBeenCalledWith(["c1"]);
  });
});

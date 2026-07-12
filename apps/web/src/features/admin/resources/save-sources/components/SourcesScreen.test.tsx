import type { SourceHealthDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SourcesData } from "../interfaces";

// Mismo patrón de mocks que ProvidersScreen/BasketEditorScreen: la pantalla lee vía `useData`; las
// mutaciones se aíslan mockeando `../api` (nunca la red real).
let mockData: SourcesData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const createSourceConfig = vi.fn();
const updateSourceConfig = vi.fn();
const pauseSourceConfig = vi.fn();
const resumeSourceConfig = vi.fn();
const probeSource = vi.fn();
const listSourcesHealthEntries = vi.fn();
vi.mock("../api", () => ({
  createSourceConfig: (...a: unknown[]) => createSourceConfig(...a),
  updateSourceConfig: (...a: unknown[]) => updateSourceConfig(...a),
  pauseSourceConfig: (...a: unknown[]) => pauseSourceConfig(...a),
  resumeSourceConfig: (...a: unknown[]) => resumeSourceConfig(...a),
  probeSource: (...a: unknown[]) => probeSource(...a),
  listSourcesHealthEntries: (...a: unknown[]) => listSourcesHealthEntries(...a),
}));

import { SourcesScreen } from "./SourcesScreen";

function source(overrides: Partial<SourceHealthDto>): SourceHealthDto {
  return {
    id: "s1",
    provider_id: "p1",
    provider_name: "Súper Uno",
    logo_url: null,
    platform: "vtex",
    base_url: "https://example.com",
    enabled: true,
    paused_at: null,
    health: "ok",
    endpoints: null,
    headers: null,
    auth: null,
    ...overrides,
  };
}

describe("SourcesScreen (rediseño tabla + modal)", () => {
  beforeEach(() => {
    createSourceConfig.mockReset();
    updateSourceConfig.mockReset();
    pauseSourceConfig.mockReset();
    resumeSourceConfig.mockReset();
    probeSource.mockReset();
    listSourcesHealthEntries.mockReset();
  });

  it("lista las fuentes en una tabla con el badge de salud correcto por fila", () => {
    mockData = {
      providers: [],
      sources: [
        source({ id: "s1", platform: "vtex", health: "ok" }),
        source({ id: "s2", platform: "shopify", health: "stale" }),
        source({ id: "s3", platform: "magento", health: "paused" }),
      ],
    };
    render(<SourcesScreen />);
    expect(screen.getByText("OK")).toHaveClass("bg-green-100");
    expect(screen.getByText("Desactualizada")).toHaveClass("bg-amber-100");
    expect(screen.getByText("Pausada")).toHaveClass("bg-gray-100");
  });

  it("muestra el estado vacío cuando no hay fuentes", () => {
    mockData = { providers: [], sources: [] };
    render(<SourcesScreen />);
    expect(screen.getByText("Sin fuentes todavía.")).toBeInTheDocument();
  });

  it("alterna entre vista lista (tabla) y cards con el toggle", () => {
    mockData = { providers: [], sources: [source({ id: "s1", platform: "vtex", provider_name: "Sirena" })] };
    render(<SourcesScreen />);
    expect(screen.getByRole("table")).toBeInTheDocument(); // lista por defecto

    fireEvent.click(screen.getByRole("radio", { name: "Ver en cards" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument(); // ya no hay tabla → cards
    expect(screen.getByRole("radio", { name: "Ver en cards" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Sirena")).toBeInTheDocument(); // la card muestra el proveedor
  });

  it("crea una fuente eligiendo el proveedor en el select-search del modal", async () => {
    mockData = { sources: [], providers: [{ id: "p1", name: "Sirena", logo_url: null }] };
    createSourceConfig.mockResolvedValue({ data: { id: "s9" } });
    listSourcesHealthEntries.mockResolvedValue([source({ id: "s9", base_url: "https://sirena.com" })]);
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));
    const dialog = await screen.findByRole("dialog");
    // select-search de proveedores: abrir y elegir "Sirena"
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Proveedor" }));
    fireEvent.click(await within(dialog).findByText("Sirena")); // click en el texto → burbujea al botón de la opción
    fireEvent.change(within(dialog).getByLabelText("Base URL"), { target: { value: "https://sirena.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(createSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: "p1", baseUrl: "https://sirena.com", platform: "vtex", auth: null }),
      ),
    );
  });

  it("pausa una fuente desde el menú de acciones de la fila", async () => {
    mockData = { providers: [], sources: [source({ id: "s1", platform: "vtex", health: "ok" })] };
    pauseSourceConfig.mockResolvedValue({ data: {} });
    listSourcesHealthEntries.mockResolvedValue([source({ id: "s1", health: "paused" })]);
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Acciones de vtex" }));
    fireEvent.click(await screen.findByText("Pausar"));

    await waitFor(() => expect(pauseSourceConfig).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(listSourcesHealthEntries).toHaveBeenCalled());
  });

  it("en edición NO reenvía el secreto enmascarado (write-only): auth va null si no se toca", async () => {
    mockData = {
      providers: [],
      sources: [
        source({
          id: "s1",
          platform: "magento",
          base_url: "https://nac.com",
          auth: { type: "api_key", in: "header", name: "X-Auth-Token", value: "••••1234" } as Record<string, string>,
        }),
      ],
    };
    updateSourceConfig.mockResolvedValue({ data: {} });
    listSourcesHealthEntries.mockResolvedValue(mockData.sources);
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Acciones de magento" }));
    fireEvent.click(await screen.findByText("Editar"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Base URL"), { target: { value: "https://nacional.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: "s1", baseUrl: "https://nacional.com", auth: null }),
      ),
    );
  });
});

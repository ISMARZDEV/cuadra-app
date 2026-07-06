import type { SourceHealthDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SourcesData } from "../interfaces";

// Mismo patrón de mocks que `save-providers/ProvidersScreen.test.tsx`: la pantalla lee vía
// `useData` y las mutaciones se aíslan mockeando `../api` (nunca la red real).
let mockData: SourcesData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const createSourceConfig = vi.fn();
const updateSourceConfig = vi.fn();
const pauseSourceConfig = vi.fn();
const resumeSourceConfig = vi.fn();
const probeSource = vi.fn();
const listSourcesHealthEntries = vi.fn();
vi.mock("../api", () => ({
  createSourceConfig: (...args: unknown[]) => createSourceConfig(...args),
  updateSourceConfig: (...args: unknown[]) => updateSourceConfig(...args),
  pauseSourceConfig: (...args: unknown[]) => pauseSourceConfig(...args),
  resumeSourceConfig: (...args: unknown[]) => resumeSourceConfig(...args),
  probeSource: (...args: unknown[]) => probeSource(...args),
  listSourcesHealthEntries: (...args: unknown[]) => listSourcesHealthEntries(...args),
}));

import { SourcesScreen } from "./SourcesScreen";

function source(overrides: Partial<SourceHealthDto>): SourceHealthDto {
  return {
    id: "s1",
    provider_id: "p1",
    platform: "vtex",
    base_url: "https://example.com",
    enabled: true,
    paused_at: null,
    health: "ok",
    ...overrides,
  };
}

describe("SourcesScreen", () => {
  beforeEach(() => {
    createSourceConfig.mockReset();
    updateSourceConfig.mockReset();
    pauseSourceConfig.mockReset();
    resumeSourceConfig.mockReset();
    probeSource.mockReset();
    listSourcesHealthEntries.mockReset();
  });

  it("lists sources with the correct health badge per row", () => {
    mockData = {
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

  it("shows the empty state when there are no sources yet", () => {
    mockData = { sources: [] };
    render(<SourcesScreen />);
    expect(screen.getByText("Sin fuentes todavía.")).toBeInTheDocument();
  });

  it("creates a new source from the form, refetches the list locally (no reload) and shows the new row", async () => {
    mockData = { sources: [] };
    createSourceConfig.mockResolvedValue({ data: { id: "s9" } });
    listSourcesHealthEntries.mockResolvedValue([
      source({ id: "s9", platform: "vtex", base_url: "https://sirena.com" }),
    ]);
    render(<SourcesScreen />);

    fireEvent.change(screen.getByLabelText("Proveedor (id)"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://sirena.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(createSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "p1",
          baseUrl: "https://sirena.com",
          platform: "vtex",
        }),
      ),
    );
    await waitFor(() => expect(listSourcesHealthEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("https://sirena.com")).toBeInTheDocument());
  });

  it("omits headers/endpoints/auth when their JSON textareas are left empty", async () => {
    mockData = { sources: [] };
    createSourceConfig.mockResolvedValue({ data: { id: "s9" } });
    listSourcesHealthEntries.mockResolvedValue([]);
    render(<SourcesScreen />);

    fireEvent.change(screen.getByLabelText("Proveedor (id)"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://sirena.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(createSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: undefined,
          endpoints: undefined,
          auth: undefined,
        }),
      ),
    );
  });

  it("parses valid JSON in headers/endpoints/auth and passes it through to the api wrapper", async () => {
    mockData = { sources: [] };
    createSourceConfig.mockResolvedValue({ data: { id: "s9" } });
    listSourcesHealthEntries.mockResolvedValue([]);
    render(<SourcesScreen />);

    fireEvent.change(screen.getByLabelText("Proveedor (id)"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://sirena.com" },
    });
    fireEvent.change(screen.getByLabelText("Headers (JSON, opcional)"), {
      target: { value: '{"Store": "jumbo"}' },
    });
    fireEvent.change(screen.getByLabelText("Endpoints (JSON, opcional)"), {
      target: { value: '{"search": "/api/search"}' },
    });
    fireEvent.change(screen.getByLabelText("Auth (JSON, opcional)"), {
      target: { value: '{"token": "abc"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(createSourceConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Store: "jumbo" },
          endpoints: { search: "/api/search" },
          auth: { token: "abc" },
        }),
      ),
    );
  });

  it("blocks submit and shows an inline error when headers JSON is invalid, never calling the api wrapper", async () => {
    mockData = { sources: [] };
    render(<SourcesScreen />);

    fireEvent.change(screen.getByLabelText("Proveedor (id)"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://sirena.com" },
    });
    fireEvent.change(screen.getByLabelText("Headers (JSON, opcional)"), {
      target: { value: "{not valid json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear fuente" }));

    await waitFor(() =>
      expect(screen.getByText("JSON inválido en headers")).toBeInTheDocument(),
    );
    expect(createSourceConfig).not.toHaveBeenCalled();
  });

  it("pauses an active source via the api wrapper and refetches locally (no reload)", async () => {
    mockData = { sources: [source({ id: "s1", platform: "vtex", health: "ok" })] };
    pauseSourceConfig.mockResolvedValue({ data: {} });
    listSourcesHealthEntries.mockResolvedValue([
      source({ id: "s1", platform: "vtex", health: "paused" }),
    ]);
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Pausar vtex" }));

    await waitFor(() => expect(pauseSourceConfig).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(listSourcesHealthEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Pausada")).toBeInTheDocument());
  });

  it("resumes a paused source via the api wrapper and refetches locally (no reload)", async () => {
    mockData = { sources: [source({ id: "s1", platform: "vtex", health: "paused" })] };
    resumeSourceConfig.mockResolvedValue({ data: {} });
    listSourcesHealthEntries.mockResolvedValue([
      source({ id: "s1", platform: "vtex", health: "ok" }),
    ]);
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Reanudar vtex" }));

    await waitFor(() => expect(resumeSourceConfig).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(listSourcesHealthEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("OK")).toBeInTheDocument());
  });

  it("Probar success renders the sample table and persists nothing", async () => {
    mockData = { sources: [source({ id: "s1", platform: "vtex", health: "ok" })] };
    probeSource.mockResolvedValue({
      ok: true,
      samples: [
        {
          external_id: "ext-1",
          name: "Arroz",
          brand: "Marca",
          price_minor: 12345,
          currency: "DOP",
          ean: "123",
        },
      ],
    });
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    fireEvent.change(screen.getByLabelText("Query de prueba para s1"), {
      target: { value: "arroz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ejecutar" }));

    await waitFor(() => expect(screen.getByText("Arroz")).toBeInTheDocument());
    expect(screen.getByText("ext-1")).toBeInTheDocument();
    // SAGRADO: el dry-run NUNCA persiste — ningún wrapper de creación/edición/pausa se invoca.
    expect(createSourceConfig).not.toHaveBeenCalled();
    expect(updateSourceConfig).not.toHaveBeenCalled();
    expect(pauseSourceConfig).not.toHaveBeenCalled();
    expect(resumeSourceConfig).not.toHaveBeenCalled();
  });

  it("Probar 422 renders the config/SSRF error message, not the upstream one", async () => {
    mockData = { sources: [source({ id: "s1", platform: "vtex", health: "ok" })] };
    probeSource.mockResolvedValue({ ok: false, kind: "config", message: "bloqueada" });
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    fireEvent.change(screen.getByLabelText("Query de prueba para s1"), {
      target: { value: "arroz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ejecutar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Configuración inválida"),
    );
    expect(screen.queryByText(/no respondió/)).not.toBeInTheDocument();
  });

  it("Probar 502 renders the upstream error message, not the config one", async () => {
    mockData = { sources: [source({ id: "s1", platform: "vtex", health: "ok" })] };
    probeSource.mockResolvedValue({ ok: false, kind: "upstream", message: "sin respuesta" });
    render(<SourcesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    fireEvent.change(screen.getByLabelText("Query de prueba para s1"), {
      target: { value: "arroz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ejecutar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no respondió"));
    expect(screen.queryByText(/Configuración inválida/)).not.toBeInTheDocument();
  });
});

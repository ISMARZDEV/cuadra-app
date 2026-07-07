import type { ProviderRefDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProvidersData } from "../interfaces";

// Mismo patrón de mocks que `save-matching/ReviewQueueListScreen.bulk-actions.test.tsx`: la
// pantalla lee vía `useData` y las mutaciones se aíslan mockeando `../api` (nunca la red real).
let mockData: ProvidersData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));

const createProvider = vi.fn();
const updateProvider = vi.fn();
const setProviderLogo = vi.fn();
const listProvidersEntries = vi.fn();
vi.mock("../api", () => ({
  createProvider: (...args: unknown[]) => createProvider(...args),
  updateProvider: (...args: unknown[]) => updateProvider(...args),
  setProviderLogo: (...args: unknown[]) => setProviderLogo(...args),
  listProvidersEntries: (...args: unknown[]) => listProvidersEntries(...args),
}));

import { ProvidersScreen } from "./ProvidersScreen";

function provider(overrides: Partial<ProviderRefDto>): ProviderRefDto {
  return { id: "p1", name: "Sirena", logo_url: null, ...overrides };
}

describe("ProvidersScreen", () => {
  beforeEach(() => {
    createProvider.mockReset();
    updateProvider.mockReset();
    setProviderLogo.mockReset();
    listProvidersEntries.mockReset();
  });

  it("lists the existing providers by name", () => {
    mockData = {
      providers: [provider({ id: "p1", name: "Sirena" }), provider({ id: "p2", name: "Jumbo" })],
    };
    render(<ProvidersScreen />);
    expect(screen.getByText("Sirena")).toBeInTheDocument();
    expect(screen.getByText("Jumbo")).toBeInTheDocument();
  });

  it("shows the empty state when there are no providers yet", () => {
    mockData = { providers: [] };
    render(<ProvidersScreen />);
    expect(screen.getByText("Sin proveedores todavía.")).toBeInTheDocument();
  });

  it("renders the logo image for a provider that already has one, text badge for one that doesn't", () => {
    mockData = {
      providers: [
        provider({ id: "p1", name: "Sirena", logo_url: null }),
        provider({ id: "p2", name: "Jumbo", logo_url: "https://cdn.example.com/jumbo.png" }),
      ],
    };
    render(<ProvidersScreen />);
    expect(screen.getByRole("img", { name: "Jumbo" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/jumbo.png",
    );
    expect(screen.queryByRole("img", { name: "Sirena" })).not.toBeInTheDocument();
  });

  it("creates a new provider from the form, refetches the list locally (no reload) and shows the new row", async () => {
    mockData = { providers: [] };
    createProvider.mockResolvedValue({ data: { id: "p9", name: "Nacional" } });
    listProvidersEntries.mockResolvedValue([provider({ id: "p9", name: "Nacional" })]);
    render(<ProvidersScreen />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nacional" } });
    fireEvent.change(screen.getByLabelText("Mercado"), { target: { value: "DO" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    await waitFor(() =>
      expect(createProvider).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Nacional", marketId: "DO" }),
      ),
    );
    await waitFor(() => expect(listProvidersEntries).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Nacional")).toBeInTheDocument());
  });

  it("shows an error and does not crash when create fails", async () => {
    mockData = { providers: [] };
    createProvider.mockResolvedValue({ error: "boom" });
    render(<ProvidersScreen />);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nacional" } });
    fireEvent.change(screen.getByLabelText("Mercado"), { target: { value: "DO" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    await waitFor(() =>
      expect(screen.getByText("No se pudo crear el proveedor.")).toBeInTheDocument(),
    );
  });

  it("saves a pasted logo URL for an existing provider, refetches locally (no reload) and shows the new logo", async () => {
    mockData = { providers: [provider({ id: "p1", name: "Sirena", logo_url: null })] };
    setProviderLogo.mockResolvedValue({ data: {} });
    listProvidersEntries.mockResolvedValue([
      provider({ id: "p1", name: "Sirena", logo_url: "https://cdn.example.com/sirena.png" }),
    ]);
    render(<ProvidersScreen />);

    fireEvent.change(screen.getByLabelText("Logo de Sirena"), {
      target: { value: "https://cdn.example.com/sirena.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar logo de Sirena" }));

    await waitFor(() =>
      expect(setProviderLogo).toHaveBeenCalledWith({
        providerId: "p1",
        logoUrl: "https://cdn.example.com/sirena.png",
      }),
    );
    await waitFor(() => expect(listProvidersEntries).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Sirena" })).toHaveAttribute(
        "src",
        "https://cdn.example.com/sirena.png",
      ),
    );
  });

  it("renames an existing provider inline", async () => {
    mockData = { providers: [provider({ id: "p1", name: "Sirena" })] };
    updateProvider.mockResolvedValue({ data: {} });
    render(<ProvidersScreen />);

    const nameInput = screen.getByLabelText("Nombre de Sirena");
    fireEvent.change(nameInput, { target: { value: "Sirena Supermercados" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre de Sirena" }));

    await waitFor(() =>
      expect(updateProvider).toHaveBeenCalledWith({
        providerId: "p1",
        name: "Sirena Supermercados",
      }),
    );
  });
});

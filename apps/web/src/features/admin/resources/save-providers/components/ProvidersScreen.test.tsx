import type { ProviderDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProvidersData } from "../interfaces";

// Mismo patrón de mocks que `save-matching/ReviewQueueListScreen.bulk-actions.test.tsx`: la
// pantalla lee vía `useData` y las mutaciones se aíslan mockeando `../api` (nunca la red real).
let mockData: ProvidersData;
vi.mock("vike-react/useData", () => ({ useData: () => mockData }));
// `toast` se pinta en un PORTAL que estos tests no montan: se espía la llamada, que es
// donde vive el contrato (qué se le dice al operador).
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const createProvider = vi.fn();
const updateProvider = vi.fn();
const setProviderLogo = vi.fn();
const listProvidersEntries = vi.fn();
const archiveProvider = vi.fn();
const unarchiveProvider = vi.fn();
vi.mock("../api", () => ({
  createProvider: (...args: unknown[]) => createProvider(...args),
  updateProvider: (...args: unknown[]) => updateProvider(...args),
  setProviderLogo: (...args: unknown[]) => setProviderLogo(...args),
  listProvidersEntries: (...args: unknown[]) => listProvidersEntries(...args),
  archiveProvider: (...args: unknown[]) => archiveProvider(...args),
  unarchiveProvider: (...args: unknown[]) => unarchiveProvider(...args),
}));

import { ProvidersScreen } from "./ProvidersScreen";

function provider(overrides: Partial<ProviderDto>): ProviderDto {
  return {
    id: "p1",
    name: "Sirena",
    type: "supermarket",
    platform: "vtex",
    market_id: "DO",
    logo_url: null,
    archived_at: null,
    ...overrides,
  };
}

/** Abre el menú de acciones de una fila y dispara el ítem pedido. */
async function rowAction(providerName: string, itemLabel: RegExp) {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`acciones de ${providerName}`, "i") }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: itemLabel }));
}

describe("ProvidersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = { providers: [] };
    listProvidersEntries.mockResolvedValue([]);
    createProvider.mockResolvedValue({ error: undefined });
    updateProvider.mockResolvedValue({ error: undefined });
    setProviderLogo.mockResolvedValue({ error: undefined });
    archiveProvider.mockResolvedValue({ error: undefined });
    unarchiveProvider.mockResolvedValue({ error: undefined });
  });

  it("lista los proveedores en una tabla con su plataforma", () => {
    mockData = {
      providers: [
        provider({ id: "p1", name: "Sirena", platform: "vtex" }),
        provider({ id: "p2", name: "Bravo", platform: "rest_catalog" }),
      ],
    };
    render(<ProvidersScreen />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Sirena")).toBeInTheDocument();
    // Etiqueta legible (`platformLabel`), no el valor crudo del enum.
    expect(screen.getByText("REST Catalog")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay proveedores", () => {
    render(<ProvidersScreen />);
    expect(screen.getByText("Sin proveedores todavía.")).toBeInTheDocument();
  });

  // El formulario anterior estaba SIEMPRE desplegado sobre la lista. Ahora el alta vive detrás de
  // un botón: si el modal apareciera solo, volveríamos a la pantalla que se pidió reemplazar.
  it("no muestra el formulario de alta hasta pulsar el botón", async () => {
    render(<ProvidersScreen />);

    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /añadir proveedor/i }));

    expect(await screen.findByLabelText("Nombre")).toBeInTheDocument();
  });

  it("crea un proveedor desde el modal y refresca la lista sin recargar la página", async () => {
    render(<ProvidersScreen />);
    fireEvent.click(screen.getByRole("button", { name: /añadir proveedor/i }));

    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "Plaza Lama" } });
    fireEvent.click(screen.getByRole("button", { name: /crear proveedor/i }));

    await waitFor(() => expect(createProvider).toHaveBeenCalled());
    expect(createProvider.mock.calls[0][0]).toMatchObject({ name: "Plaza Lama" });
    await waitFor(() => expect(listProvidersEntries).toHaveBeenCalled());
  });

  it("permite editar tipo y plataforma, no solo el nombre", async () => {
    mockData = { providers: [provider({})] };
    render(<ProvidersScreen />);

    await rowAction("Sirena", /editar/i);

    expect(await screen.findByLabelText("Tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Plataforma")).toBeInTheDocument();
  });

  // El PATCH general y el del logo son endpoints DISTINTOS y se auditan por separado: emitir el
  // segundo cuando el logo no cambió ensuciaría el audit log con una entrada por cada guardado.
  it("al editar sin tocar el logo NO llama al endpoint de logo", async () => {
    mockData = { providers: [provider({ logo_url: "https://cdn/x.png" })] };
    render(<ProvidersScreen />);

    await rowAction("Sirena", /editar/i);
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "Sirena Market" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(updateProvider).toHaveBeenCalled());
    expect(setProviderLogo).not.toHaveBeenCalled();
  });

  // Archivar saca al proveedor de la INGESTA: deja de recogerse precio de esa cadena. Dispararlo
  // con un solo clic del menú es exactamente el accidente que ConfirmDialog existe para evitar.
  it("archivar pide confirmación antes de disparar la mutación", async () => {
    mockData = { providers: [provider({})] };
    render(<ProvidersScreen />);

    await rowAction("Sirena", /archivar/i);
    expect(archiveProvider).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByTestId("confirm-accept"));

    await waitFor(() => expect(archiveProvider).toHaveBeenCalledWith("p1"));
  });

  // Asimetría deliberada: restaurar solo DESHACE. Ponerle fricción castiga a quien está corrigiendo.
  it("restaurar un archivado no pide confirmación", async () => {
    mockData = { providers: [provider({ archived_at: "2026-07-27T00:00:00Z" })] };
    render(<ProvidersScreen />);

    await rowAction("Sirena", /restaurar/i);

    await waitFor(() => expect(unarchiveProvider).toHaveBeenCalledWith("p1"));
    expect(screen.queryByTestId("confirm-accept")).not.toBeInTheDocument();
  });

  it("informa el fallo de archivado en vez de fingir que funcionó", async () => {
    archiveProvider.mockResolvedValue({ error: { detail: "boom" } });
    mockData = { providers: [provider({})] };
    render(<ProvidersScreen />);

    await rowAction("Sirena", /archivar/i);
    fireEvent.click(await screen.findByTestId("confirm-accept"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("filtra por el buscador", () => {
    mockData = {
      providers: [provider({ id: "p1", name: "Sirena" }), provider({ id: "p2", name: "Bravo" })],
    };
    render(<ProvidersScreen />);

    fireEvent.change(screen.getByLabelText(/buscar proveedor/i), { target: { value: "bra" } });

    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Sirena")).not.toBeInTheDocument();
  });

  it("si el refresco FALLA, conserva la tabla y avisa — nunca la vacía en silencio", async () => {
    // El bug: `listProvidersEntries` devolvía `[]` ante error, así que un fallo de red tras
    // archivar dejaba "0 proveedores" en pantalla. El operador concluía que no había ninguno.
    // restaurar NO pide confirmación (archivar sí), así que llega directo al refresco
    mockData = {
      providers: [provider({ id: "p1", name: "Sirena", archived_at: "2026-07-01T00:00:00Z" })],
    };
    listProvidersEntries.mockResolvedValue(null); // el contrato de error del repo
    render(<ProvidersScreen />);

    await rowAction("Sirena", /restaurar/i);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    // la fila sigue ahí: datos viejos son mejores que una tabla que miente
    expect(screen.getByText("Sirena")).toBeInTheDocument();
  });
});

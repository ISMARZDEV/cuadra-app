import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalDetailData } from "../interfaces";
import { CanonicalDetailScreen } from "./CanonicalDetailScreen";

// El histórico se pide en el cliente (su rango es interactivo), así que el mock del api es lo que
// mantiene estos tests sobre los paneles SSR y no sobre la red.
const getHistory = vi.fn();
vi.mock("../api", () => ({
  getCanonicalProductHistory: (...args: unknown[]) => getHistory(...args),
  listCanonicalProducts: vi.fn(),
  addCanonicalImage: vi.fn(),
  reorderCanonicalImages: vi.fn(),
  removeCanonicalImage: vi.fn(),
  archiveCanonicalProduct: vi.fn(),
  unarchiveCanonicalProduct: vi.fn(),
  updateCanonicalProduct: vi.fn(),
  updateInternalNote: vi.fn(),
  previewCanonicalSlug: vi.fn(),
  regenerateCanonicalSlug: vi.fn(),
  setCanonicalCategory: vi.fn(),
}));
vi.mock("vike/client/router", () => ({ navigate: vi.fn() }));

const DATA: CanonicalDetailData = {
  product: {
    canonical_product_id: "cp-1",
    slug: "arroz-goya-10-lb",
    name: "Arroz Goya 10 Lb",
    brand: "GOYA",
    display_size: "10 Lb",
    size_amount: "10" as never,
    size_measure: "mass",
    image_url: null,
    category: "Arroz",
    taxonomy_node_id: null,
    quality: null,
    ean_reachable: true,
    origin_run_id: null,
    matched_provider_count: 1,
    possible_duplicate_count: 1,
    last_price_seen_at: "2026-07-20T10:00:00Z",
    last_match_at: null,
    quality_statuses: ["no_image"],
    completeness_score: 67,
    description: null,
    created_at: "2026-07-01T10:00:00Z",
    internal_note: null,
    archived_at: null,
  },
  providers: [
    {
      provider_id: "p1",
      provider_name: "Sirena",
      store_product_id: "sp-1",
      price_minor: 212500,
      currency: "DOP",
      provider_logo_url: null,
      store_product_image_url: "https://cdn/sirena.jpg",
      url: "https://sirena.do/x",
      last_seen_at: "2026-07-20T10:00:00Z",
      is_cheapest: true,
    },
  ],
  evidence: [
    {
      store_product_id: "sp-1",
      provider_id: "p1",
      provider_name: "Sirena",
      raw_name: "Arroz Goya 10 Lb",
      raw_brand: "GOYA",
      raw_size_text: "10 Lb",
      // A propósito SIN zero-padding: el panel tiene que mostrarlo en GTIN-14.
      ean: "781086020518",
      sku: "9567",
      image_url: null,
      store_product_url: null,
      match_method: "human",
      match_confidence: 0,
      matched_at: null,
    },
  ],
  duplicates: [
    {
      canonical_product_id: "cp-2",
      slug: "arroz-goya-otro",
      name: "Arroz Goya Otro",
      brand: "GOYA",
      display_size: "10 Lb",
      category: "Arroz",
      signals: ["ean_collision"],
      has_ean_collision: true,
    },
  ],
  // Las 11 acciones que el backend emite hoy (grep de `"canonical_product.*"` en apps/api).
  // Están TODAS acá a propósito: es lo que impide que una acción nueva vuelva a llegar a la
  // pantalla como clave cruda.
  auditLog: [
    {
      id: "a1",
      action: "canonical_product.update",
      actor_user_id: "1234abcd-0000-0000-0000-000000000000",
      payload_summary: { changed: ["name", "brand"] },
      created_at: "2026-07-22T10:00:00Z",
    },
    ...[
      "canonical_product.create",
      "canonical_product.import",
      "canonical_product.archive",
      "canonical_product.unarchive",
      "canonical_product.internal_note",
      "canonical_product.add_image",
      "canonical_product.remove_image",
      "canonical_product.reorder_images",
      "canonical_product.set_category",
      "canonical_product.regenerate_slug",
    ].map((action, i) => ({
      id: `a${i + 2}`,
      action,
      actor_user_id: "1234abcd-0000-0000-0000-000000000000",
      payload_summary: {},
      created_at: "2026-07-22T10:00:00Z",
    })),
  ],
  taxonomyLeaves: [{ id: "tax-1", name: "Arroz", top_name: "Granos", top_slug: "granos" }],
  categorySuggestions: [
    { taxonomy_node_id: "tax-1", name: "Arroz", matched_tokens: ["arroz"], signal: "lexicon" },
  ],
  images: [],
  params: {
    limit: 20,
    offset: 0,
  },
  cursor: {
    total: 1,
    position: 1,
    previous_id: null,
    next_id: null,
  },
  locale: "es",
};

vi.mock("vike-react/useData", () => ({ useData: () => DATA }));

/** El fetch del histórico resuelve DESPUÉS del render: sin envolverlo, cada test emite un aviso
 * de `act()` y la salida de la suite se llena de ruido que tapa los fallos reales. */
async function renderDetail() {
  await act(async () => {
    render(<CanonicalDetailScreen />);
  });
}

/** Cambia de sección. Los paneles viven en tabs, así que casi todo se mira desde alguna. */
async function openTab(name: string) {
  await act(async () => {
    screen.getByRole("tab", { name }).click();
  });
}

describe("CanonicalDetailScreen", () => {
  beforeEach(() => {
    getHistory.mockReset();
    getHistory.mockResolvedValue(null);
  });

  // ── Reparto de los paneles entre las cinco secciones ───────────────────────

  it("Resumen trae identidad, proveedores e histórico — y nada de auditoría", async () => {
    await renderDetail();

    // Por encabezado y no por texto suelto: "Proveedores matcheados" también rotula el chip del
    // hero, y un `getByText` no distingue el resumen de arriba del panel de abajo.
    for (const title of ["Identidad canónica", "Proveedores matcheados", "Histórico y KPIs"]) {
      expect(
        screen.getByRole("heading", { level: 2, name: new RegExp(title) }),
      ).toBeInTheDocument();
    }
    // Evidencia en la primera pantalla es ruido: el operador viene a ver precios, no el rastro
    // de cómo se enlazó cada tienda.
    expect(screen.queryByText(/Evidencia/)).not.toBeInTheDocument();
  });

  it("Auditoría junta evidencia, duplicados y actividad", async () => {
    await renderDetail();
    await openTab("Auditoría");

    for (const title of ["Evidencia", "Duplicados posibles", "Actividad y notas"]) {
      expect(screen.getByText(new RegExp(title))).toBeInTheDocument();
    }
  });

  it("cada sección abre su propio panel etiquetado", async () => {
    await renderDetail();

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "canonical-detail-panel-summary");
    expect(panel).toHaveAttribute("aria-labelledby", "canonical-detail-tab-summary");
  });

  it("Categorías y Descripción tienen su propia sección", async () => {
    await renderDetail();

    await openTab("Categorías");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      "canonical-detail-panel-categories",
    );

    await openTab("Descripción");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      "canonical-detail-panel-description",
    );
  });

  it("normaliza el EAN a GTIN-14 en Evidencia", async () => {
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.getByText("00781086020518")).toBeInTheDocument();
  });

  it("un match humano no muestra 0% de confianza", async () => {
    // La fila guarda 0 porque no hubo modelo; "0%" se leería como que el sistema dudó.
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText("Decidido por una persona")).toBeInTheDocument();
  });

  it("el audit log traduce la acción y muestra quién y qué campos", async () => {
    await renderDetail();
    await openTab("Auditoría");

    expect(screen.getByText("Edición")).toBeInTheDocument();
    // El fixture trae los 11 tipos de acción, todos del mismo actor.
    expect(screen.getAllByText(/1234abcd/).length).toBeGreaterThan(0);
    expect(screen.getByText(/name, brand/)).toBeInTheDocument();
  });

  it("una colisión de EAN se destaca por encima de las señales léxicas", async () => {
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.getByText("Mismo EAN")).toBeInTheDocument();
  });

  it("ofrece la imagen de la tienda como candidata de la galería", async () => {
    await renderDetail();
    await openTab("Imágenes del producto");
    expect(screen.getByRole("button", { name: /Agregar/ })).toBeInTheDocument();
  });

  it("con la galería vacía lo dice en vez de mostrar un hueco", async () => {
    await renderDetail();
    await openTab("Imágenes del producto");
    expect(screen.getByText(/todavía no tiene imágenes/i)).toBeInTheDocument();
  });

  it("el botón de subir EXISTE aunque la función esté diferida", async () => {
    // Esconderlo dejaría al operador buscando una función que sí vamos a tener; al tocarlo se
    // explica por qué todavía no hace nada.
    await renderDetail();
    await openTab("Imágenes del producto");
    expect(screen.getByRole("button", { name: /Subir imagen/ })).toBeInTheDocument();
  });

  it("un histórico que falla lo dice en vez de dejar el panel en blanco", async () => {
    await renderDetail();
    expect(screen.getByText(/No se pudo cargar el histórico/i)).toBeInTheDocument();
  });

  it("la nota interna avisa que nunca sale a la página pública", async () => {
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.getByText(/Nunca aparece en la página pública/i)).toBeInTheDocument();
  });

  it("muestra el badge EAN-alcanzable en el header", async () => {
    await renderDetail();
    expect(screen.getByText("Alcanzable por EAN")).toBeInTheDocument();
  });

  // ── Actividad: nada de jerga del backend en pantalla ────────────────────────

  it("NINGUNA acción de auditoría se muestra con su clave cruda", async () => {
    // `auditActionLabel` caía a `return action` cuando faltaba el mapeo, y el operador terminaba
    // leyendo "canonical_product.reorder_images" en la pantalla.
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.queryByText(/canonical_product\./)).not.toBeInTheDocument();
  });

  it("traduce las acciones de imagen y de categoría", async () => {
    await renderDetail();
    await openTab("Auditoría");
    expect(screen.getByText("Imagen agregada")).toBeInTheDocument();
    expect(screen.getByText("Imagen quitada")).toBeInTheDocument();
    expect(screen.getByText("Imágenes reordenadas")).toBeInTheDocument();
    expect(screen.getByText("Categoría asignada")).toBeInTheDocument();
    expect(screen.getByText("Slug regenerado")).toBeInTheDocument();
  });

  // ── El error del histórico tiene salida ────────────────────────────────────

  it("el error del histórico ofrece reintentar", async () => {
    // El copy decía "Reintentá en un momento" sin darle al operador con qué hacerlo.
    await renderDetail();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("reintentar vuelve a pedir el histórico", async () => {
    await renderDetail();
    const callsBefore = getHistory.mock.calls.length;

    await act(async () => {
      screen.getByRole("button", { name: /Reintentar/i }).click();
    });

    expect(getHistory.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

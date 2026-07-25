import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalDetailData } from "../interfaces";
import { CanonicalDetailScreen } from "./CanonicalDetailScreen";

// El histórico se pide en el cliente (su rango es interactivo), así que el mock del api es lo que
// mantiene estos tests sobre los paneles SSR y no sobre la red.
const getHistory = vi.fn();
vi.mock("../api", () => ({
  getCanonicalProductHistory: (...args: unknown[]) => getHistory(...args),
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
  auditLog: [
    {
      id: "a1",
      action: "canonical_product.update",
      actor_user_id: "1234abcd-0000-0000-0000-000000000000",
      payload_summary: { changed: ["name", "brand"] },
      created_at: "2026-07-22T10:00:00Z",
    },
  ],
  taxonomyLeaves: [{ id: "tax-1", name: "Arroz", top_name: "Granos", top_slug: "granos" }],
  categorySuggestions: [
    { taxonomy_node_id: "tax-1", name: "Arroz", matched_tokens: ["arroz"], signal: "lexicon" },
  ],
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

describe("CanonicalDetailScreen", () => {
  beforeEach(() => {
    getHistory.mockReset();
    getHistory.mockResolvedValue(null);
  });

  it("muestra los ocho paneles del SDD", async () => {
    await renderDetail();

    for (const title of [
      "Información canónica",
      "Proveedores matcheados",
      "Histórico y KPIs",
      "Imagen del producto",
      "Evidencia",
      "Duplicados posibles",
      "Actividad y notas",
    ]) {
      expect(screen.getByText(new RegExp(title))).toBeInTheDocument();
    }
  });

  it("normaliza el EAN a GTIN-14 en Evidencia", async () => {
    await renderDetail();
    expect(screen.getByText("00781086020518")).toBeInTheDocument();
  });

  it("un match humano no muestra 0% de confianza", async () => {
    // La fila guarda 0 porque no hubo modelo; "0%" se leería como que el sistema dudó.
    await renderDetail();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText("Decidido por una persona")).toBeInTheDocument();
  });

  it("el audit log traduce la acción y muestra quién y qué campos", async () => {
    await renderDetail();

    expect(screen.getByText("Edición")).toBeInTheDocument();
    expect(screen.getByText(/1234abcd/)).toBeInTheDocument();
    expect(screen.getByText(/name, brand/)).toBeInTheDocument();
  });

  it("una colisión de EAN se destaca por encima de las señales léxicas", async () => {
    await renderDetail();
    expect(screen.getByText("Mismo EAN")).toBeInTheDocument();
  });

  it("ofrece la imagen de la tienda como candidata cuando el canónico no tiene", async () => {
    await renderDetail();
    expect(screen.getByRole("button", { name: /Usar esta/ })).toBeInTheDocument();
  });

  it("declara que subir imagen está bloqueado en vez de ofrecer un botón muerto", async () => {
    await renderDetail();
    expect(screen.getByText(/requiere definir el almacenamiento/i)).toBeInTheDocument();
  });

  it("un histórico que falla lo dice en vez de dejar el panel en blanco", async () => {
    await renderDetail();
    expect(screen.getByText(/No se pudo cargar el histórico/i)).toBeInTheDocument();
  });

  it("la nota interna avisa que nunca sale a la página pública", async () => {
    await renderDetail();
    expect(screen.getByText(/Nunca aparece en la página pública/i)).toBeInTheDocument();
  });

  it("muestra el badge EAN-alcanzable en el header", async () => {
    await renderDetail();
    expect(screen.getByText("Alcanzable por EAN")).toBeInTheDocument();
  });
});

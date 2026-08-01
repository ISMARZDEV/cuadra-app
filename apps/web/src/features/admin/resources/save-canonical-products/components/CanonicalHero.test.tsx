import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
} from "@cuadra/api-client";
import { translate } from "@/i18n/messages";

import { CanonicalHero } from "./CanonicalHero";

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

const PRODUCT: AdminCanonicalProductRowDto = {
  canonical_product_id: "cp-1",
  slug: "leche-rica-listamilk-33-8-oz",
  name: "Leche Rica Listamilk 33.8 Oz",
  brand: "RICA",
  display_size: "33.8 Oz",
  size_amount: "33.8" as never,
  size_measure: "volume",
  image_url: null,
  category: "Leche",
  category_top: "Lácteos y Delicatessen",
  category_top_slug: "lacteos-delicatessen",
  taxonomy_node_id: "tax-1",
  quality: null,
  ean_reachable: true,
  ean: "07460083780146",
  min_price_minor: 7400,
  max_price_minor: 7500,
  price_currency: "DOP",
  matched_provider_count: 3,
  completeness_score: 86,
  quality_statuses: [],
  last_price_seen_at: "2026-07-25T10:00:00Z",
  last_match_at: "2026-07-21T10:00:00Z",
  created_at: "2026-07-21T09:15:00Z",
  description: "Leche entera rica, la más nutritiva y natural de la República Dominicana.",
  archived_at: null,
};

function provider(over: Partial<AdminCanonicalProviderPriceDto> = {}) {
  return {
    provider_id: "p1",
    provider_name: "Sirena",
    store_product_id: "sp-1",
    price_minor: 7400,
    currency: "DOP",
    is_cheapest: true,
    ...over,
  } as AdminCanonicalProviderPriceDto;
}

function renderHero(over: {
  product?: Partial<AdminCanonicalProductRowDto>;
  providers?: AdminCanonicalProviderPriceDto[];
} = {}) {
  const onSync = vi.fn();
  render(
    <CanonicalHero
      product={{ ...PRODUCT, ...over.product }}
      providers={over.providers ?? [provider({ previous_price_minor: 9500 })]}
      imageCount={8}
      locale="es"
      t={t as never}
      publicHref="/es/do/save/producto/leche-rica-listamilk-33-8-oz"
      onSync={onSync}
      onEdit={vi.fn()}
      syncing={false}
    />,
  );
  return { onSync };
}

describe("CanonicalHero", () => {
  it("da el nombre como encabezado de la página", () => {
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Leche Rica Listamilk 33.8 Oz",
    );
  });

  it("muestra el EAN con su código, no sólo la etiqueta", () => {
    // El operador compara códigos entre tiendas: un badge que sólo dice "EAN" no sirve de nada.
    renderHero();
    expect(screen.getByText("07460083780146")).toBeInTheDocument();
  });

  // ─ El precio y su bajada (ahora en ProductPreviewCard) ─────────────────────

  it("el precio grande es el MÁS BARATO entre tiendas", () => {
    renderHero();
    // El precio ahora se muestra en el ProductPreviewCard con formato "$74.00"
    expect(screen.getByText("$74.")).toBeInTheDocument();
  });

  it("tacha el precio anterior de la tienda más barata", () => {
    renderHero();
    // El precio anterior ahora se muestra en el ProductPreviewCard
    expect(screen.getByText("$95.")).toBeInTheDocument();
  });

  it("una bajada del 22% se destaca con el círculo", () => {
    renderHero();
    expect(screen.getByTestId("preview-price-drop")).toHaveTextContent("-22%");
  });

  it("una bajada CHICA no se destaca, pero el tachado queda", () => {
    // 10000 → 9100 son 9%: por debajo del piso que fijó producto.
    renderHero({
      product: { min_price_minor: 9100 },
      providers: [provider({ price_minor: 9100, previous_price_minor: 10000 })],
    });

    expect(screen.queryByTestId("preview-price-drop")).not.toBeInTheDocument();
    expect(screen.getByText("$100.")).toBeInTheDocument();
  });

  it("sin precio anterior no hay tachado ni círculo", () => {
    renderHero({ providers: [provider({ previous_price_minor: null })] });

    expect(screen.queryByTestId("preview-price-drop")).not.toBeInTheDocument();
  });

  it("el precio anterior sale de la tienda MÁS BARATA, no de la primera", () => {
    // Bravo aparece primero en la lista pero no es la más barata; su bajada no es la del hero.
    renderHero({
      providers: [
        provider({ provider_id: "p2", is_cheapest: false, price_minor: 9000,
          previous_price_minor: 30000 }),
        provider({ previous_price_minor: 9500 }),
      ],
    });

    expect(screen.getByText("$95.")).toBeInTheDocument();
  });

  // ── Estado ──────────────────────────────────────────────────────────────────

  it("un producto vigente se muestra como Activo", () => {
    renderHero();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("un producto archivado NO se muestra como Activo", () => {
    renderHero({ product: { archived_at: "2026-07-26T10:00:00Z" } });

    expect(screen.queryByText("Activo")).not.toBeInTheDocument();
    expect(screen.getByText("Archivado")).toBeInTheDocument();
  });

  it("traduce la completitud a una palabra, no sólo a un número", () => {
    renderHero();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("una calidad vacía lo dice en vez de dejar el hueco", () => {
    renderHero();
    expect(screen.getByText("No definida")).toBeInTheDocument();
  });

  // ── Acciones ────────────────────────────────────────────────────────────────

  it("Sincronizar avisa al contenedor", async () => {
    const { onSync } = renderHero();
    // El botón Sync ahora vive dentro del dropdown "Acciones"
    const actionsButton = screen.getByRole("button", { name: /Acciones/ });
    actionsButton.click();
    const syncItem = await screen.findByText(/Sincronizar/);
    syncItem.click();
    expect(onSync).toHaveBeenCalled();
  });

  it("los CUATRO KPIs se declaran como demostración", () => {
    // Cuatro cifras grandes sin respaldo real al lado de datos verdaderos son una trampa. El chip
    // lo pone `KpiCard` (el mismo de la Cola de revisión y Orquestación), no una marca propia.
    renderHero();

    const chips = screen.getAllByText("demo");
    expect(chips).toHaveLength(4);
    expect(chips[0]).toHaveAttribute("title", "Datos de demostración");
  });
});

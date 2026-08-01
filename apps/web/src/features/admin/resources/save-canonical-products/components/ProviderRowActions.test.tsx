import type { AdminCanonicalProviderPriceDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n/messages";

import { ProviderRowActions } from "./ProviderRowActions";

// El diálogo de rematcheo busca canónicos contra el servidor; se stubea el módulo de api entero
// porque el componente lo importa directo (no por inyección) para no cargar de props a la tabla.
vi.mock("../api", () => ({
  listCanonicalProducts: vi.fn(async () => ({
    rows: [
      { canonical_product_id: "cid-actual", name: "Arroz Actual", brand: "X", display_size: "1 kg" },
      {
        canonical_product_id: "cid-otro",
        name: "Arroz Otro",
        brand: "Y",
        display_size: "1 kg",
        image_url: "https://cdn.example/arroz-otro.jpg",
      },
      // Sin `image_url`: la falta de foto se ANUNCIA, no queda como un hueco mudo.
      { canonical_product_id: "cid-sin-foto", name: "Arroz Sin Foto", brand: "Z", display_size: "2 kg" },
    ],
    total: 3,
  })),
}));

const t = (key: Parameters<typeof translate>[1]) => translate("es", key);

const ROW = {
  provider_id: "p1",
  provider_name: "Nacional",
  store_product_id: "sp-1",
  price_minor: 16495,
  currency: "DOP",
  provider_logo_url: null,
  url: "https://tienda.example/producto",
  last_seen_at: "2026-07-25T21:22:00Z",
  is_cheapest: true,
  // Los tres crudos de la tienda (lo que muestra Auditoría y lo que el servidor deriva). La
  // descripción es DISTINTA del nombre a propósito: el test verifica que el diálogo no las confunda.
  store_product_name: "Arroz Selecto Líder 10 Lb",
  store_product_brand: null,
  store_product_size_text: "10 Lb",
} as AdminCanonicalProviderPriceDto;

const LEAVES: TaxonomyLeafDto[] = [
  { id: "leaf-1", name: "Arroz", top_name: "Despensa", top_slug: "despensa" },
];

function renderActions(over: Partial<Parameters<typeof ProviderRowActions>[0]> = {}) {
  const handlers = {
    onDiscard: vi.fn(async () => ({ deleted_price_count: 12 })),
    onUnlink: vi.fn(async () => {}),
    onRelink: vi.fn(async () => {}),
    onPromote: vi.fn(async () => "nuevo-cid"),
    onDone: vi.fn(),
  };
  render(
    <ProviderRowActions
      canonicalProductId="cid-actual"
      row={ROW}
      leaves={LEAVES}
      locale="es"
      t={t as never}
      decidedBy="admin"
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: t("admin.canonicalDetail.providers.col.actions") }));

describe("ProviderRowActions — el menú", () => {
  it("ofrece las cuatro acciones además de Abrir", () => {
    renderActions();
    openMenu();

    expect(screen.getByText(t("admin.canonicalProducts.providers.open"))).toBeTruthy();
    expect(screen.getByText(t("admin.canonicalDetail.providers.actions.unlink"))).toBeTruthy();
    expect(screen.getByText(t("admin.canonicalDetail.providers.actions.relink"))).toBeTruthy();
    expect(screen.getByText(t("admin.canonicalDetail.providers.actions.promote"))).toBeTruthy();
    expect(screen.getByText(t("admin.canonicalDetail.providers.actions.discard"))).toBeTruthy();
  });

  it("NINGUNA acción muta al hacer clic en el menú: todas abren un diálogo primero", () => {
    // Es la garantía de que no hay forma de destruir datos con un clic descuidado en una lista.
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.discard")));

    expect(h.onDiscard).not.toHaveBeenCalled();
    expect(screen.getByText(t("admin.canonicalDetail.providers.discard.warning"))).toBeTruthy();
  });
});

describe("#1 · borrado duro", () => {
  it("el botón de confirmar está BLOQUEADO hasta escribir el nombre de la tienda", () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.discard")));

    const confirm = screen.getByRole("button", {
      name: t("admin.canonicalDetail.providers.discard.confirm"),
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.click(confirm);
    expect(h.onDiscard).not.toHaveBeenCalled();
  });

  it("escribir el nombre exacto lo habilita y dispara el borrado", async () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.discard")));

    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.discard.typeToConfirmLabel")),
      { target: { value: "Nacional" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: t("admin.canonicalDetail.providers.discard.confirm") }),
    );

    await waitFor(() => expect(h.onDiscard).toHaveBeenCalledWith("sp-1"));
    await waitFor(() => expect(h.onDone).toHaveBeenCalled());
  });

  it("un nombre que no coincide NO habilita el borrado", () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.discard")));

    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.discard.typeToConfirmLabel")),
      { target: { value: "Nacionel" } },
    );
    expect(
      screen
        .getByRole("button", { name: t("admin.canonicalDetail.providers.discard.confirm") })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(h.onDiscard).not.toHaveBeenCalled();
  });

  it("avisa que el producto es RE-INGERIBLE, no solo que se borra", () => {
    // Sin esto el operador evita la acción por miedo; el borrado es recuperable por ingesta y
    // decirlo es parte de que la acción se use cuando corresponde.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.discard")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.discard.reingest"))).toBeTruthy();
  });
});

describe("#2 · devolver a la cola", () => {
  it("exige motivo: sin elegirlo no llama al backend", () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.unlink")));

    fireEvent.click(
      screen.getByRole("button", { name: t("admin.canonicalDetail.providers.unlink.confirm") }),
    );
    expect(h.onUnlink).not.toHaveBeenCalled();
  });

  it("dice explícitamente que NO se borra el histórico", () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.unlink")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.unlink.keepsHistory"))).toBeTruthy();
  });
});

describe("#3 · rematchear a otro canónico", () => {
  it("muestra ARRIBA el producto que se está moviendo", () => {
    // Elegir entre doce canónicos parecidos sin el origen a la vista obliga a comparar contra la
    // memoria, y el error acá mueve el precio de una tienda al producto equivocado.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.relink.sourceLabel"))).toBeTruthy();
    expect(screen.getByText("Arroz Selecto Líder 10 Lb")).toBeTruthy();
    expect(screen.getByAltText("Nacional")).toBeTruthy();
    expect(screen.getByText("RD$164.95")).toBeTruthy();
  });

  it("rotula origen y destino aparte, para no confundir la tarjeta con un resultado", () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.relink.targetLabel"))).toBeTruthy();
  });

  it("no busca con menos de 2 caracteres", () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.relink.typeMore"))).toBeTruthy();
  });

  it("EXCLUYE el canónico actual de los resultados", async () => {
    // Ofrecer "moverlo a donde ya está" produce un no-op que el operador lee como un fallo.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));

    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.relink.searchPlaceholder")),
      { target: { value: "arroz" } },
    );

    await waitFor(() => expect(screen.getByText("Arroz Otro")).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText("Arroz Actual")).toBeNull();
  });

  it("muestra la FOTO de cada canónico, y anuncia cuando falta", async () => {
    // Una búsqueda de "arroz" devuelve doce filas casi idénticas; la foto es lo que las separa de un
    // vistazo. Cuando la tienda no publicó imagen, el hueco se ANUNCIA en vez de quedar mudo.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));
    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.relink.searchPlaceholder")),
      { target: { value: "arroz" } },
    );

    await waitFor(() => expect(screen.getByText("Arroz Otro")).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByAltText("Arroz Otro")).toBeTruthy();
    expect(
      screen.getAllByLabelText(t("admin.canonicalDetail.providers.dialog.noPhoto")).length,
    ).toBeGreaterThan(0);
  });

  it("marca con un check la fila elegida, para no confundirla con el hover", async () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));
    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.relink.searchPlaceholder")),
      { target: { value: "arroz" } },
    );

    await waitFor(() => expect(screen.getByText("Arroz Otro")).toBeTruthy(), { timeout: 2000 });
    const row = screen.getByText("Arroz Otro").closest("button");
    expect(row?.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByText("Arroz Otro"));
    expect(screen.getByText("Arroz Otro").closest("button")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("mueve al canónico elegido", async () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.relink")));
    fireEvent.change(
      screen.getByLabelText(t("admin.canonicalDetail.providers.relink.searchPlaceholder")),
      { target: { value: "arroz" } },
    );

    await waitFor(() => expect(screen.getByText("Arroz Otro")).toBeTruthy(), { timeout: 2000 });
    fireEvent.click(screen.getByText("Arroz Otro"));
    fireEvent.click(
      screen.getByRole("button", { name: t("admin.canonicalDetail.providers.relink.confirm") }),
    );

    await waitFor(() => expect(h.onRelink).toHaveBeenCalledWith("sp-1", "cid-otro"));
  });
});

describe("#4 · crear canónico nuevo", () => {
  it("está BLOQUEADO sin categoría (el backend la exige)", () => {
    const h = renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(
      screen
        .getByRole("button", { name: t("admin.canonicalDetail.providers.promote.confirm") })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(h.onPromote).not.toHaveBeenCalled();
  });

  it("avisa cuando no hay taxonomía cargada, en vez de mostrar un picker vacío", () => {
    renderActions({ leaves: [] });
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.promote.noTaxonomy"))).toBeTruthy();
  });

  it("muestra el NOMBRE de la tienda, no su descripción comercial", () => {
    // Regresión: mostraba `store_product_description` ("Arroz blanco de grano largo") en lugar de
    // `store_product_name` ("Arroz Selecto Líder 10 Lb"), o sea prometía crear un producto distinto
    // del que el servidor iba a crear. Es la peor clase de error en una confirmación.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(screen.getByText("Arroz Selecto Líder 10 Lb")).toBeTruthy();
    expect(screen.queryByText("Arroz blanco de grano largo.")).toBeNull();
    // Marca y tamaño son los otros dos que deriva el servidor. Texto EXACTO, no regex: `/10 Lb/`
    // también empataría con el nombre ("…Líder 10 Lb") y el matcher fallaría por ambigüedad.
    expect(screen.getByText("10 Lb")).toBeTruthy();
  });

  it("EXPLICA por qué el botón está bloqueado, no solo que lo está", () => {
    // Voz del admin: los bloqueos dicen POR QUÉ. Un botón apagado y mudo obliga a adivinar.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(
      screen.getByText(t("admin.canonicalDetail.providers.promote.blockedNoCategory")),
    ).toBeTruthy();
  });

  it("muestra la procedencia: logo de la cadena y precio junto al producto", () => {
    // Principio 2 del producto: mostrar de dónde salió el dato. El operador reconoce la cadena por
    // su logo —igual que en la tabla y en Auditoría—, no por un nombre suelto en un párrafo.
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(screen.getByAltText("Nacional")).toBeTruthy();
    expect(screen.getByText("RD$164.95")).toBeTruthy();
  });

  it("BLOQUEA la creación si la tienda no informa nombre (el backend la rechaza)", () => {
    const h = renderActions({
      row: { ...ROW, store_product_name: null } as never,
    });
    openMenu();
    fireEvent.click(screen.getByText(t("admin.canonicalDetail.providers.actions.promote")));

    expect(screen.getByText(t("admin.canonicalDetail.providers.promote.noName"))).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: t("admin.canonicalDetail.providers.promote.confirm") })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(h.onPromote).not.toHaveBeenCalled();
  });
});

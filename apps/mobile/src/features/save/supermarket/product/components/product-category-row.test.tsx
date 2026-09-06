import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage, t } from "@/i18n";

// ⚠️ `category-images` se moquea porque su mapa son `require("@/assets/…png")` de METRO: los
// resuelve Node en tiempo de EJECUCIÓN, así que los alias de Vite —que sólo tocan los `import` que
// transforma— no llegan a verlos y el módulo revienta al importarse («Cannot find module»).
// Es un límite del arnés, no del componente: se moquea la FRONTERA y se prueba la decisión.
vi.mock("../../category-images", () => ({
  categoryImage: (slug: string) =>
    slug === "despensa-abarrotes" ? { uri: "despensa.png" } : null,
  fallbackInitial: (name: string) => (Array.from(name.trim())[0] ?? "?").toUpperCase(),
}));

import { HEADER_CARDS, resolveSkin } from "../../header-palette";
import { ProductCategoryRow } from "./product-category-row";

// La carta de la llegada: de ella salen los dos colores del disco de la flecha.
const PIEL = resolveSkin(HEADER_CARDS[0], false);
const CON_IMAGEN = { slug: "despensa-abarrotes", name: "Despensa & Abarrotes" };
// Una categoría cuya ilustración todavía no exportaron: el mapa de `category-images` es explícito
// y se queda corto a propósito mientras diseño no entrega el resto.
const SIN_IMAGEN = { slug: "pescaderia-artesanal", name: "Pescadería Artesanal" };

describe("ProductCategoryRow", () => {
  beforeEach(() => setLanguage("es"));

  test("enseña el nombre de la categoría", () => {
    render(<ProductCategoryRow category={CON_IMAGEN} skin={PIEL} onPress={() => {}} />);

    expect(screen.getByText("Despensa & Abarrotes")).toBeTruthy();
  });

  test("el botón lleva a la categoría", () => {
    const ir = vi.fn();
    render(<ProductCategoryRow category={CON_IMAGEN} skin={PIEL} onPress={ir} />);

    fireEvent.click(screen.getByLabelText(t("save.product.category.go")));

    expect(ir).toHaveBeenCalled();
  });

  test("tocar la FILA entera también lleva — el área tocable no es sólo la flecha", () => {
    const ir = vi.fn();
    render(<ProductCategoryRow category={CON_IMAGEN} skin={PIEL} onPress={ir} />);

    // El nombre es parte de la fila, no del botón: si sólo la flecha llevara, esto no dispararía.
    fireEvent.click(screen.getByText("Despensa & Abarrotes"));

    expect(ir).toHaveBeenCalled();
  });

  test("sin ilustración exportada, cae a la INICIAL en vez de dejar un hueco", () => {
    render(<ProductCategoryRow category={SIN_IMAGEN} skin={PIEL} onPress={() => {}} />);

    // Misma degradación que la ruleta: un disco vacío se lee como una imagen que no cargó; la
    // inicial se lee como una categoría.
    expect(screen.getByText("P")).toBeTruthy();
  });
});

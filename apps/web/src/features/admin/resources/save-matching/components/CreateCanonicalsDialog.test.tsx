import type { AdminReviewQueueRowDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreateCanonicalsDialog } from "./CreateCanonicalsDialog";

const LEAVES: TaxonomyLeafDto[] = [
  { id: "leaf-arroz", name: "Arroz, Granos & Legumbres", top_name: "Despensa", top_slug: "despensa" },
  { id: "leaf-cerveza", name: "Cerveza", top_name: "Alcohol", top_slug: "alcohol" },
];

function row(over: Partial<AdminReviewQueueRowDto> = {}): AdminReviewQueueRowDto {
  return {
    match_id: "m1",
    store_product_id: "sp1",
    confidence: 0,
    method: "human",
    provider_id: "p1",
    provider_name: "Sirena",
    store_product_name: "Arroz Selecto 5 Lb",
    category: { slug: "despensa", name: "Despensa" },
    candidate_count: 0,
    created_at: "2026-07-20T12:00:00Z",
    ...over,
  } as AdminReviewQueueRowDto;
}

function dialog(rows: AdminReviewQueueRowDto[], props = {}) {
  return render(
    <CreateCanonicalsDialog
      open
      onOpenChange={vi.fn()}
      rows={rows}
      leaves={LEAVES}
      onConfirm={vi.fn()}
      locale="es"
      {...props}
    />,
  );
}

describe("CreateCanonicalsDialog", () => {
  it("LISTA los productos, no un número: es lo único revisable antes de escribir", () => {
    // La versión anterior resumía por categoría, y con la cola en arranque en frío —donde nada
    // tiene categoría— el diálogo mostraba literalmente nada. Un "3" no se puede revisar.
    dialog([
      row({ match_id: "a", store_product_name: "Habichuelas Negras Con Coco" }),
      row({ match_id: "b", store_product_name: "Arroz La Garza Premium" }),
    ]);

    expect(screen.getAllByTestId("canonize-row")).toHaveLength(2);
    expect(screen.getByText("Habichuelas Negras Con Coco")).toBeTruthy();
    expect(screen.getByText("Arroz La Garza Premium")).toBeTruthy();
  });

  it("muestra el tamaño y la marca, que también entran al canónico", () => {
    dialog([row({ store_product_size_text: "15 Oz", store_product_brand: "LA FAMOSA" })]);

    expect(screen.getByText(/15 Oz · LA FAMOSA/)).toBeTruthy();
  });

  it("marca EN LA FILA cuál no tiene categoría", () => {
    // Saber que "faltan 2" no dice CUÁLES. El operador necesita ver el producto para decidir.
    dialog([row({ match_id: "a" }), row({ match_id: "b", category: null })]);

    expect(screen.getAllByTestId("canonize-row-missing")).toHaveLength(1);
  });

  it("BLOQUEA la creación mientras queden filas sin categoría", () => {
    // Saltarlas en silencio sería la mentira que este módulo tiene prohibida: el operador se iría
    // creyendo que creó 48 cuando creó 38.
    dialog([row({ match_id: "a" }), row({ match_id: "b", category: null })]);

    expect(screen.getByTestId("confirm-accept").hasAttribute("disabled")).toBe(true);
    // Y DICE cuántas faltan: un botón bloqueado sin explicar por qué es un callejón sin salida.
    expect(screen.getByText(/1 sin categoría/)).toBeTruthy();
  });

  it("se desbloquea al elegir, y la fila sin categoría MUESTRA la elegida", () => {
    // Elegir en un combobox y no ver dónde aterrizó obliga a confiar; verlo es confirmarlo.
    dialog([row({ match_id: "a" }), row({ match_id: "b", category: null })]);

    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Despensa › Arroz, Granos & Legumbres"));

    expect(screen.getByTestId("confirm-accept").hasAttribute("disabled")).toBe(false);
    expect(screen.queryByTestId("canonize-row-missing")).toBeNull();
  });

  it("no pide nada cuando TODAS ya tienen categoría", () => {
    dialog([row({ match_id: "a" }), row({ match_id: "b" })]);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("confirm-accept").hasAttribute("disabled")).toBe(false);
  });

  it("el botón dice el NÚMERO y el sustantivo, nunca 'Confirmar'", () => {
    // Es una acción irreversible sobre el catálogo maestro: el botón tiene que poder leerse solo.
    dialog([row({ match_id: "a" }), row({ match_id: "b" })]);

    expect(screen.getByTestId("confirm-accept").textContent).toContain("2");
  });

  it("pasa el fallback SOLO cuando hizo falta", () => {
    const onConfirm = vi.fn();
    dialog([row({ match_id: "a" }), row({ match_id: "b" })], { onConfirm });

    fireEvent.click(screen.getByTestId("confirm-accept"));

    // Sin huecos no se manda fallback: mandarlo invitaría a pisar categorías ya decididas.
    expect(onConfirm).toHaveBeenCalledWith(null, {});
  });

  it("deja cambiar la categoría de UNA fila, incluso tras aplicar la masiva", () => {
    // El fallback resuelve el grueso; las excepciones se corrigen acá, viendo el producto.
    const onConfirm = vi.fn();
    dialog([row({ match_id: "a", store_product_name: "Guandules" })], { onConfirm });

    // La fila ya tiene categoría propia y aun así se puede corregir: es un acto deliberado.
    fireEvent.click(screen.getAllByLabelText("Cambiar categoría")[0]);
    fireEvent.click(screen.getByText("Cerveza"));
    fireEvent.click(screen.getByTestId("confirm-accept"));

    expect(onConfirm).toHaveBeenCalledWith(null, { a: "leaf-cerveza" });
  });

  it("un override cuenta como categoría: desbloquea sin usar el fallback", () => {
    dialog([row({ match_id: "a", category: null })]);

    expect(screen.getByTestId("confirm-accept").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getAllByLabelText("Cambiar categoría")[0]);
    fireEvent.click(screen.getByText("Cerveza"));

    expect(screen.getByTestId("confirm-accept").hasAttribute("disabled")).toBe(false);
  });

  it("pagina cuando la selección no entra en una página", () => {
    // Cincuenta filas seleccionadas vuelven la lista un pozo de scroll donde revisar es imposible.
    const many = Array.from({ length: 25 }, (_, i) =>
      row({ match_id: `m${i}`, store_product_name: `Producto ${i}` }),
    );
    dialog(many);

    expect(screen.getAllByTestId("canonize-row")).toHaveLength(10);
    expect(screen.getByText("1–10 / 25")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Página siguiente"));

    expect(screen.getByText("11–20 / 25")).toBeTruthy();
  });

  it("no muestra controles de paginación si todo entra en una página", () => {
    dialog([row({ match_id: "a" })]);

    expect(screen.queryByTestId("canonize-page-size")).toBeNull();
  });

  it("ofrece una X para cerrar sin bajar hasta el pie", () => {
    dialog([row()]);

    expect(screen.getAllByLabelText("Cancelar").length).toBeGreaterThan(0);
  });
});

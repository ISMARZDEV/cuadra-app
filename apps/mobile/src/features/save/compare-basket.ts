import type { ProductCardDto } from "@cuadra/api-client";
import { create } from "zustand";

// La canasta de COMPARACIÓN de Save.
//
// ⚠️ NO es un carrito, y la distinción es del producto, no del código: Save COMPARA PRECIOS, no
// vende. No hay dónde añadir ni con qué pagar. Esta canasta junta productos para verlos lado a lado
// —la misma idea que ya usa el agente del chat con su `BasketCard`—, y por eso el «+» de la tarjeta
// es un interruptor y no un contador de unidades.
//
// Vive en memoria a propósito: sobrevive a la navegación entre pantallas y pestañas (el store es de
// módulo), pero no al cierre de la app. Una comparación es una intención del momento; recuperar la
// de anteayer al abrir sería ruido, no ayuda.
const MAX_ITEMS = 20;

/** Lo mínimo para dibujar la comparación. Es un subconjunto de `ProductCardDto` a propósito: la
 *  canasta no debe atarse a la forma completa del DTO para poder recibir productos de otra fuente. */
export type CompareItem = Pick<ProductCardDto, "id" | "name"> & Partial<ProductCardDto>;

type CompareBasketState = {
  items: CompareItem[];
  add: (item: CompareItem) => void;
  remove: (id: string) => void;
  toggle: (item: CompareItem) => void;
  has: (id: string) => boolean;
  clear: () => void;
};

export const useCompareBasket = create<CompareBasketState>((set, get) => ({
  items: [],

  add: (item) =>
    set((s) => {
      // Repetido no entra: comparar un producto consigo mismo no significa nada y el contador
      // mentiría. Lleno tampoco — se queda con lo que YA elegiste en vez de empujarlo fuera.
      if (s.items.some((p) => p.id === item.id) || s.items.length >= MAX_ITEMS) return s;
      return { items: [...s.items, item] };
    }),

  remove: (id) => set((s) => ({ items: s.items.filter((p) => p.id !== id) })),

  toggle: (item) =>
    get().has(item.id) ? get().remove(item.id) : get().add(item),

  has: (id) => get().items.some((p) => p.id === id),

  clear: () => set({ items: [] }),
}));

/** Cuántos hay dentro. Selector propio para que el contador del header se suscriba SÓLO al número y
 *  no a la lista — con la lista entera, añadir uno re-renderiza el header por un cambio que no ve. */
export const useCompareCount = () => useCompareBasket((s) => s.items.length);

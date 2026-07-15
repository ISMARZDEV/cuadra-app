import { useSyncExternalStore } from "react";

import {
  addToList,
  listCount,
  listTotal,
  removeFromList,
  setQty,
  type ShoppingListItem,
} from "@/features/save/lib/shopping-list";

// Store de la lista local: localStorage + pub/sub, expuesto vía useSyncExternalStore (SSR-safe:
// el servidor renderiza vacío y el cliente re-lee tras hidratar; sincroniza header + botones +
// página, y entre pestañas con el evento `storage`).

const KEY = "cuadra:save:list";
const EMPTY: ShoppingListItem[] = []; // snapshot de servidor ESTABLE (evita loops de render)

let cache: ShoppingListItem[] = read();
const listeners = new Set<() => void>();

function read(): ShoppingListItem[] {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShoppingListItem[]) : [];
  } catch {
    return [];
  }
}

function commit(next: ShoppingListItem[]): void {
  cache = next;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent): void {
  if (e.key === KEY) {
    cache = read();
    listeners.forEach((l) => l());
  }
}

export const shoppingList = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  },
  add: (item: ShoppingListItem) => commit(addToList(cache, item)),
  remove: (id: string) => commit(removeFromList(cache, id)),
  setQty: (id: string, qty: number) => commit(setQty(cache, id, qty)),
  clear: () => commit([]),
};

export function useShoppingList() {
  const items = useSyncExternalStore(
    shoppingList.subscribe,
    () => cache,
    () => EMPTY,
  );
  return {
    items,
    count: listCount(items),
    total: listTotal(items),
    add: shoppingList.add,
    remove: shoppingList.remove,
    setQty: shoppingList.setQty,
    clear: shoppingList.clear,
  };
}

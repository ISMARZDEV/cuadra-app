// Lista de compra LOCAL (D1) — sin auth: vive en localStorage del navegador. Reducers PUROS
// (sin React ni storage), testeables solos. La persistencia + reactividad viven en
// use-shopping-list.ts. El precio guardado es el MÁS BARATO al momento de agregar (snapshot).

export interface ShoppingListItem {
  id: string;
  name: string;
  brand: string;
  image_url: string | null;
  price_minor: number;
  currency: string;
  qty: number;
}

// Agrega un ítem; si ya está, suma su cantidad (no duplica la fila).
export function addToList(
  items: ShoppingListItem[],
  item: ShoppingListItem,
): ShoppingListItem[] {
  const existing = items.find((i) => i.id === item.id);
  if (existing) {
    return items.map((i) =>
      i.id === item.id ? { ...i, qty: i.qty + item.qty } : i,
    );
  }
  return [...items, item];
}

export function removeFromList(items: ShoppingListItem[], id: string): ShoppingListItem[] {
  return items.filter((i) => i.id !== id);
}

// Fija la cantidad; qty ≤ 0 quita el ítem (el stepper baja hasta quitar).
export function setQty(
  items: ShoppingListItem[],
  id: string,
  qty: number,
): ShoppingListItem[] {
  if (qty <= 0) return removeFromList(items, id);
  return items.map((i) => (i.id === id ? { ...i, qty } : i));
}

// Nº total de unidades (badge del carrito).
export function listCount(items: ShoppingListItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

// Suma precio×cantidad en minor units (asume moneda uniforme del mercado; solo presenta).
export function listTotal(items: ShoppingListItem[]): number {
  return items.reduce((n, i) => n + i.price_minor * i.qty, 0);
}

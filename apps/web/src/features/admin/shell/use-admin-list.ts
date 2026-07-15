import { useState } from "react";

// Reemplaza el `window.location.reload()` post-mutación de las tres consolas admin
// (Providers/Sources/Basket): la lista arranca del prop SSR (`+data.ts`) y, tras cualquier
// mutación exitosa, se re-pide con el mismo fetcher client-side y se reemplaza en estado local —
// sin recargar la página, sin TanStack Query.
//
// Re-sincroniza cuando cambia la data SSR (`initial`): navegar por filtro/orden/PAGINACIÓN reejecuta
// `data()` y `useData()` devuelve un array NUEVO. Sin este guard, `useState(initial)` congelaba las
// filas en la primera página (paginar no cambiaba nada). Patrón oficial de React "ajustar estado al
// cambiar un prop" (comparación por referencia, en render, sin useEffect ni flicker); como solo
// dispara cuando `initial` cambia de referencia, NO pisa el resultado de un `refresh()` previo.
export function useAdminList<T>(initial: T[], fetcher: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>(initial);
  const [prevInitial, setPrevInitial] = useState<T[]>(initial);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }

  const refresh = async () => {
    const next = await fetcher();
    setItems(next);
  };

  return { items, refresh };
}

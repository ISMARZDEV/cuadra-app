import { useState } from "react";

// Reemplaza el `window.location.reload()` post-mutación de las tres consolas admin
// (Providers/Sources/Basket): la lista arranca del prop SSR (`+data.ts`) y, tras cualquier
// mutación exitosa, se re-pide con el mismo fetcher client-side y se reemplaza en estado local —
// sin recargar la página, sin TanStack Query.
export function useAdminList<T>(initial: T[], fetcher: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>(initial);

  const refresh = async () => {
    const next = await fetcher();
    setItems(next);
  };

  return { items, refresh };
}

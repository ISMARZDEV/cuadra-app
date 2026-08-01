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
// El fetcher devuelve `null` ante error (contrato de `api.ts` en todo el admin). `refresh` responde
// si FUE BIEN, para que la pantalla avise: cuatro consolas hacían `res.data ?? []` y un fallo de red
// dejaba la tabla en "0 resultados", indistinguible de una lista realmente vacía. El operador leía
// "no hay proveedores" cuando lo que había pasado era que la petición se cayó.
export function useAdminList<T>(initial: T[], fetcher: () => Promise<T[] | null>) {
  const [items, setItems] = useState<T[]>(initial);
  const [prevInitial, setPrevInitial] = useState<T[]>(initial);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }

  /** `false` = el refresco falló. Lo ya mostrado se CONSERVA — datos viejos son mejores que una
   *  tabla vacía que miente. Una lista vacía de verdad (`[]`) sí se aplica: eso no es un fallo. */
  const refresh = async (): Promise<boolean> => {
    const next = await fetcher();
    if (next === null) return false;
    setItems(next);
    return true;
  };

  return { items, refresh };
}

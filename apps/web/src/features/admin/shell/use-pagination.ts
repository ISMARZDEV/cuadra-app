import { useMemo, useState } from "react";

/** Opciones fijas de "por página" del admin. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

export interface UsePaginationOptions {
  defaultLimit?: number;
  pageSizes?: readonly number[];
}

/**
 * Paginación CLIENT-SIDE sobre una lista ya cargada: la aritmética estaba copiada en 10 pantallas
 * del admin, con la misma fórmula en las cinco líneas de `total`/`totalPages`/`currentPage`/
 * `from`/`to`. Una copia con un `Math.max` de menos es un off-by-one silencioso en un footer.
 *
 * `setLimit` vuelve SIEMPRE a la primera página: si estabas en la 5 con páginas de 10 y pasás a 50,
 * la página 5 no existe y la tabla queda vacía sin explicar por qué.
 *
 * `pageSizeOptions` inyecta el `limit` vigente cuando no está en la lista fija (p.ej. el default de
 * 50 que manda el backend), para que el `<Select>` siempre tenga un valor válido seleccionado.
 */
export function usePagination<T>(items: readonly T[], options: UsePaginationOptions = {}) {
  const { defaultLimit = 10, pageSizes = PAGE_SIZE_OPTIONS } = options;
  const [limit, setLimitRaw] = useState(defaultLimit);
  const [offset, setOffset] = useState(0);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const pageRows = useMemo(() => items.slice(offset, offset + limit), [items, offset, limit]);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const pageSizeOptions = pageSizes.includes(limit)
    ? pageSizes
    : [...pageSizes, limit].sort((a, b) => a - b);

  return {
    limit,
    setLimit: (next: number) => {
      setLimitRaw(next);
      setOffset(0);
    },
    offset,
    setOffset,
    /** Vuelve a la primera página. Lo usa cualquier filtro: el rango tiene que cuadrar con lo visible. */
    reset: () => setOffset(0),
    goToPage: (page: number) => setOffset((page - 1) * limit),
    total,
    totalPages,
    currentPage,
    pageRows,
    from,
    to,
    pageSizeOptions,
  };
}

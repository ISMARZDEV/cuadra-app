import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Ventana deslizante de números de página. Estaba copiada en 4 pantallas con la misma fórmula. */
export function pageWindow(current: number, total: number, max = 5): number[] {
  const start = Math.max(1, Math.min(current - Math.floor(max / 2), total - max + 1));
  return Array.from({ length: Math.min(max, total) }, (_, i) => start + i);
}

export interface AdminTableFooterProps {
  /** Tamaño de página vigente y sus opciones. */
  limit: number;
  onLimitChange: (limit: number) => void;
  pageSizeOptions: readonly number[];
  currentPage: number;
  totalPages: number;
  /** Recibe la página (1-based). El caller decide si eso navega por URL o mueve un offset local. */
  onPageChange: (page: number) => void;
  /** Rango YA formateado ("1–10 de 42"). Se pasa hecho a propósito: cada recurso tiene su propia
   * clave i18n y dos formas distintas de armarlo (interpolada vs palabra suelta), así que
   * resolverlo acá obligaría al componente a conocer el catálogo de claves de todos. */
  rangeLabel: string;
  showLabel: string;
  perPageLabel: string;
  /** `data-testid` del rango. Cada pantalla ya tenía el suyo y los tests lo usan por nombre. */
  rangeTestId?: string;
  className?: string;
}

/**
 * Pie de tabla del admin: tamaño de página · rango · paginador.
 *
 * Estaba DUPLICADO en 10 pantallas — mismo markup, mismas clases, misma lógica de ventana — y esa
 * duplicación ya había derivado: unas usaban `format(...)` y otras concatenaban. Presentacional
 * puro: no posee estado, así que extraerlo no mueve de lugar ninguna decisión.
 */
export function AdminTableFooter({
  limit,
  onLimitChange,
  pageSizeOptions,
  currentPage,
  totalPages,
  onPageChange,
  rangeLabel,
  showLabel,
  perPageLabel,
  rangeTestId = "admin-table-range",
  className,
}: AdminTableFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>{showLabel}</span>
        <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
          <SelectTrigger size="sm" className="w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{perPageLabel}</span>
      </div>

      <span data-testid={rangeTestId}>{rangeLabel}</span>

      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          {pageWindow(currentPage, totalPages).map((p) => (
            <PaginationItem key={p}>
              <PaginationLink isActive={p === currentPage} onClick={() => onPageChange(p)}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

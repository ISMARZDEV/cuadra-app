import { useState } from "react";

import { usePageI18n } from "@/i18n/usePageI18n";

import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

// Números visibles: primero, último, actual±1, con "…" en los huecos (patrón clásico).
function pageNumbers(current: number, total: number): (number | "…")[] {
  const keep = new Set(
    [1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total),
  );
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

// Paginación numerada (modo "Páginas"), compuesta con los componentes shadcn Pagination + Select.
export function Pagination({
  page,
  totalPages,
  onNavigate,
}: {
  page: number;
  totalPages: number;
  onNavigate: (page: number) => void;
}) {
  const { t } = usePageI18n();
  if (totalPages <= 1) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
      <PaginationRoot className="w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              disabled={page <= 1}
              onClick={() => onNavigate(page - 1)}
            />
          </PaginationItem>
          {pageNumbers(page, totalPages).map((p, i) =>
            p === "…" ? (
              <PaginationItem key={`e${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink isActive={p === page} onClick={() => onNavigate(p)}>
                  {p}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              disabled={page >= totalPages}
              onClick={() => onNavigate(page + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </PaginationRoot>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{t("category.goToPage")}</span>
        <Select value={String(page)} onValueChange={(v) => onNavigate(Number(v))}>
          <SelectTrigger size="sm" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

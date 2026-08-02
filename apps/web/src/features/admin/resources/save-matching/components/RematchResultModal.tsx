import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, ExternalLink, Link2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui-base/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { MethodBadge } from "@/features/admin/components/MethodBadge";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/messages";

/** Una fila del resultado del re-match (`BulkRematchRowDto`). */
export interface RematchResultRow {
  match_id: string;
  status: string;
  method: string;
  confidence: number;
  store_product_name?: string | null;
  canonical_product_id?: string | null;
  canonical_name?: string | null;
}

const PAGE_SIZES = [10, 25, 50] as const;

/** Ventana deslizante de números de página, igual que en la Cola de revisión y el catálogo. */
function pageWindow(current: number, total: number, max = 5): number[] {
  const start = Math.max(1, Math.min(current - Math.floor(max / 2), total - max + 1));
  return Array.from({ length: Math.min(max, total) }, (_, i) => start + i);
}

/**
 * Qué se enlazó contra qué, después de re-evaluar. El toast da los NÚMEROS; esto da los PARES, que
 * es lo único que permite auditar si el enlace fue correcto — un id contra otro id no se revisa.
 *
 * Muestra sólo las enlazadas: el modal responde "¿qué se enlazó?", y mezclar las que siguieron en
 * la cola obligaría a filtrar a ojo justo lo que se vino a mirar. Las otras dos cuentas viven en el
 * pie, para que nadie crea que el lote terminó cuando no lo hizo.
 */
export function RematchResultModal({
  rows,
  failedCount,
  onClose,
  locale,
}: {
  rows: RematchResultRow[];
  failedCount: number;
  onClose: () => void;
  locale: Locale;
}) {
  const { t } = useAdminI18n(locale);
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);

  const linked = useMemo(() => rows.filter((r) => r.status === "auto_linked"), [rows]);
  const stillPending = rows.length - linked.length;

  const totalPages = Math.max(1, Math.ceil(linked.length / limit));
  const visible = linked.slice((page - 1) * limit, page * limit);
  const from = linked.length === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, linked.length);

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => !o && onClose()}
      // Sólo se cierra con la X o con «Cerrar». Este modal es el ÚNICO lugar donde vive el
      // resultado del lote —no se vuelve a pedir al servidor—, así que un clic fuera por accidente
      // obligaba a re-ejecutar la corrida entera para volver a verlo. Escape SÍ sigue cerrando: es
      // la salida esperada por teclado y quitarla dejaría encerrado a quien no usa mouse.
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-lime/25 text-brand-forest dark:bg-brand-lime/15 dark:text-brand-lime">
              <Link2 className="size-5" />
            </span>
            <Dialog.Title className="text-xl font-bold text-brand-forest dark:text-brand-lime">
              {t("admin.reviewQueue.rematch.modal.title")}
            </Dialog.Title>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto rounded-full text-muted-foreground hover:text-foreground"
                />
              }
            >
              <X className="size-5" />
              <span className="sr-only">{t("admin.reviewQueue.rematch.modal.close")}</span>
            </Dialog.Close>
          </div>

          <div className="border-t border-border" />

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {linked.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
                {/* La tabla scrollea DENTRO de la tarjeta: con nombres largos, sin esto las
                    columnas de la derecha quedan recortadas y sin forma de llegar a ellas. */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.reviewQueue.rematch.modal.colQueue")}</TableHead>
                        <TableHead className="w-8" />
                        <TableHead>{t("admin.reviewQueue.rematch.modal.colCanonical")}</TableHead>
                        <TableHead className="w-24">
                          {t("admin.reviewQueue.rematch.modal.colMethod")}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {t("admin.reviewQueue.rematch.modal.colConfidence")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((r) => (
                        <TableRow key={r.match_id}>
                          <TableCell className="font-medium">
                            <span className="block max-w-[16rem] truncate">
                              {r.store_product_name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ArrowRight
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </TableCell>
                          <TableCell>
                            {/* El canónico es un ENLACE a su ficha, en pestaña nueva: el modal es
                                para auditar, y si algo se ve raro hay que poder abrirlo sin perder
                                el resultado del lote. */}
                            <a
                              href={`/admin/canonical-products/${r.canonical_product_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-center gap-1.5 text-brand-forest hover:underline dark:text-brand-lime"
                            >
                              <span className="block max-w-[16rem] truncate">
                                {r.canonical_name}
                              </span>
                              <ExternalLink
                                className="size-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
                                aria-hidden="true"
                              />
                            </a>
                          </TableCell>
                          <TableCell>
                            <MethodBadge method={r.method} />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-muted-foreground tabular-nums">
                            {Math.round(r.confidence * 100)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pie idéntico al de la Cola de revisión: tamaño de página · rango · paginador. */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{t("admin.reviewQueue.pagination.showing")}</span>
                    <Select
                      value={String(limit)}
                      onValueChange={(v) => {
                        setLimit(Number(v));
                        setPage(1); // el rango cambia de tamaño: quedarse en la página 5 podría dejar la tabla vacía
                      }}
                    >
                      <SelectTrigger size="sm" className="w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span>{t("admin.reviewQueue.pagination.perPage")}</span>
                  </div>

                  <span data-testid="rematch-result-range">
                    {from}–{to} {t("admin.reviewQueue.pagination.of")} {linked.length}
                  </span>

                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          aria-disabled={page <= 1}
                          className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                        />
                      </PaginationItem>
                      {pageWindow(page, totalPages).map((p) => (
                        <PaginationItem key={p}>
                          <PaginationLink isActive={p === page} onClick={() => setPage(p)}>
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          aria-disabled={page >= totalPages}
                          className={
                            page >= totalPages ? "pointer-events-none opacity-50" : undefined
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            ) : null}

            {linked.length === 0 ? (
              // Vacío HONESTO: una tabla vacía se lee como "se rompió". Esto dice que la corrida SÍ
              // pasó y que el catálogo todavía no tiene a qué enlazar.
              <p
                data-testid="rematch-result-empty"
                className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
              >
                {t("admin.reviewQueue.rematch.modal.empty")}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border" />
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            {/* Las tres cuentas SIEMPRE visibles: sin esto un lote a medias se lee como terminado. */}
            <p data-testid="rematch-result-summary" className="text-sm text-muted-foreground">
              {format(locale, "admin.reviewQueue.rematch.modal.summary", {
                linked: String(linked.length),
                pending: String(stillPending),
                failed: String(failedCount),
              })}
            </p>
            <Dialog.Close
              render={
                <Button className="shrink-0 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90" />
              }
            >
              {t("admin.reviewQueue.rematch.modal.close")}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

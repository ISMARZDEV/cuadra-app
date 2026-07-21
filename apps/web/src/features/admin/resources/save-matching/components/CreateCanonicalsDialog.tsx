import { Dialog } from "@base-ui/react/dialog";
import type { AdminReviewQueueRowDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { ChevronLeft, ChevronRight, ImageOff, PackagePlus, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui-base/button";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { FilterSearchSelect } from "@/features/admin/components/filters/FilterSearchSelect";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/messages";

import { CategoryPicker } from "./CategoryPicker";
import { parseSize } from "../lib/parse-size";

/**
 * "Aprobar y crear canónico" en lote — la revisión ANTES de escribir en el catálogo maestro.
 *
 * No es un `¿estás seguro?`. Es la última pantalla donde el operador puede notar que algo está mal
 * antes de una escritura IRREVERSIBLE, así que su trabajo es MOSTRAR lo que va a pasar:
 *
 *  - **Se listan los productos, no un número.** La primera versión resumía por categoría, y con la
 *    cola en arranque en frío —donde nada tiene categoría— eso dejaba el diálogo mostrando
 *    literalmente nada más que una advertencia. Un "3" no se puede revisar; "Habichuelas Negras Con
 *    Coco · 15 Oz" sí: el operador reconoce el producto y sabe al instante si la categoría encaja.
 *  - **La categoría elegida se refleja en vivo** en las filas que la van a recibir. Elegir en un
 *    combobox y no ver dónde aterrizó obliga a confiar; verlo es confirmarlo.
 *  - **El botón se BLOQUEA** mientras queden filas sin categoría, y dice el número y el sustantivo.
 *    Saltarlas en silencio haría que el operador se fuera creyendo que creó 48 cuando creó 38.
 *
 * Todo lo demás del canónico (nombre, marca, cantidad convertida a unidad base) lo deriva el
 * SERVIDOR del propio producto — por eso acá no hay formulario, solo una decisión.
 */
export function CreateCanonicalsDialog({
  open,
  onOpenChange,
  rows,
  leaves,
  onConfirm,
  busy = false,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Las filas SELECCIONADAS. */
  rows: AdminReviewQueueRowDto[];
  leaves: TaxonomyLeafDto[];
  /** `fallback` = `null` si ninguna fila tenía hueco. `overrides` = lo elegido fila por fila. */
  onConfirm: (fallbackTaxonomyNodeId: string | null, overrides: Record<string, string>) => void;
  busy?: boolean;
  locale: Locale;
}) {
  const { t } = useAdminI18n(locale);
  const [fallback, setFallback] = useState<string | undefined>(undefined);
  // Categoría elegida a mano para una fila concreta. Gana sobre la suya y sobre el fallback: es un
  // acto deliberado sobre ESA fila. Vive solo acá hasta confirmar — nada se escribe antes.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(10);
  const [offset, setOffset] = useState(0);

  const byId = useMemo(() => new Map(leaves.map((l) => [l.id, l])), [leaves]);

  /** La categoría que ESTA fila va a tener: override > la suya > el fallback. Misma precedencia
   *  que el backend — si divergieran, el diálogo prometería algo distinto de lo que ocurre. */
  const effectiveFor = (r: AdminReviewQueueRowDto) => {
    const chosenLeaf = byId.get(overrides[r.match_id] ?? "");
    if (chosenLeaf) return { slug: chosenLeaf.top_slug, name: chosenLeaf.top_name };
    if (r.category) return { slug: r.category.slug, name: r.category.name };
    const fb = byId.get(fallback ?? "");
    return fb ? { slug: fb.top_slug, name: fb.top_name } : null;
  };

  // Cuántas quedarían SIN categoría tras aplicar overrides — el fallback no cuenta acá: su ausencia
  // es justamente lo que hay que resolver.
  const missing = useMemo(
    () => rows.filter((r) => !r.category && !overrides[r.match_id]).length,
    [rows, overrides],
  );
  const options = useMemo(
    // "Tope › Hoja": el nombre de la hoja solo es ambiguo entre categorías, y hay homónimas.
    () => leaves.map((l) => ({ value: l.id, label: `${l.top_name} › ${l.name}` })),
    [leaves],
  );

  // Bloqueado mientras haya huecos sin llenar. `busy` es otra cosa (ya está corriendo).
  const blocked = missing > 0 && !fallback;

  // Paginación: la selección puede ser de decenas de filas y una lista infinita deja de ser
  // revisable. Mismo lenguaje que las tablas del admin (tamaño de página + rango + páginas).
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.floor(offset / pageSize) + 1);
  const visible = rows.slice(offset, offset + pageSize);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + pageSize, total);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        {/* Ancho de REVISIÓN, no de confirmación: acá se leen nombres de producto de 40+ caracteres
            con su tamaño, su marca y su categoría en la misma línea. A 448px (el ancho de un
            `¿estás seguro?`) todo eso se parte y deja de ser revisable. */}
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start gap-3 px-6 pt-6">
            {/* `PackagePlus` y no un triángulo de alerta: esto CREA algo, no rompe nada. La gravedad
                (que es real: no se deshace) la lleva el texto, que es donde se puede leer. */}
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-lime/25 text-brand-forest [&_svg]:size-5 dark:bg-brand-lime/15 dark:text-brand-lime">
              <PackagePlus />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {t("admin.reviewQueue.canonize.title")}
              </Dialog.Title>
            </div>
            {/* Salida siempre visible en la esquina. "Cancelar" está abajo del todo, y con la lista
                paginada puede quedar lejos del punto donde el operador decide abandonar. */}
            <Dialog.Close
              aria-label={t("admin.basket.cancel")}
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.95]"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {missing > 0 ? (
            // El selector va ARRIBA de la lista: es la decisión que desbloquea todo, y su efecto se
            // ve inmediatamente debajo. Debajo de la lista habría que hacer scroll para encontrarlo.
            // `relative z-20`: la lista del combobox se posiciona con `z-10` DENTRO de este bloque,
            // y el pie del diálogo viene después en el DOM — sin un contexto de apilado propio, el
            // pie se pintaba encima de las últimas opciones y las volvía INCLICABLES. Lo destapó la
            // automatización ("intercepts pointer events"), no la vista: a ojo el desplegable
            // parecía correcto porque el solape caía justo en el borde.
            <div className="relative z-20 mx-6 mt-4 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                <TriangleAlert className="size-4 shrink-0" />
                {format(locale, "admin.reviewQueue.canonize.missing", { n: String(missing) })}
              </p>
              <div className="mt-2.5">
                {/* El MISMO combobox buscable del modal de filtros. Un `<select>` nativo abría un
                    desplegable del sistema operativo que se escapaba del modal, tapaba media
                    pantalla y no tenía búsqueda — sobre 120 categorías, inservible. */}
                <FilterSearchSelect
                  value={fallback}
                  onChange={setFallback}
                  options={options}
                  placeholder={t("admin.reviewQueue.category.search")}
                  allLabel={t("admin.reviewQueue.canonize.choose")}
                />
              </div>
              <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/70">
                {t("admin.reviewQueue.canonize.onlyFillsGaps")}
              </p>
            </div>
          ) : null}

          {/* El aviso de irreversibilidad vive PEGADO a lo que describe: sobre la lista de lo que
              se va a crear, no perdido en el encabezado tres bloques más arriba. */}
          <div className="px-6 pt-5 pb-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("admin.reviewQueue.canonize.preview")}
            </p>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {format(locale, "admin.reviewQueue.canonize.description", {
                n: String(rows.length),
              })}
            </Dialog.Description>
          </div>

          {/* La lista scrollea, no el diálogo: el encabezado y las acciones quedan siempre a la
              vista, incluso con cincuenta filas seleccionadas. */}
          <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-6">
            {visible.map((r) => {
              const size = parseSize(r.store_product_size_text);
              const effective = effectiveFor(r);
              return (
                <li key={r.match_id} data-testid="canonize-row" className="flex items-center gap-3 py-2.5">
                  {r.store_product_image_url ? (
                    <img
                      src={r.store_product_image_url}
                      alt=""
                      loading="lazy"
                      className="size-9 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ImageOff className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {r.store_product_name ?? r.match_id}
                    </span>
                    {/* Tamaño y marca: son parte de lo que se va a escribir, así que se muestran. */}
                    <span className="block truncate text-xs text-muted-foreground">
                      {[size.amount && size.unit ? `${size.amount} ${size.unit}` : size.amount, r.store_product_brand]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {/* Cada fila es EDITABLE, incluso después de aplicar la categoría masiva: el
                      fallback resuelve el grueso y acá se corrigen las excepciones, viendo el
                      producto. Es la misma interacción que la celda de la tabla (`CategoryPicker`
                      compartido), pero acá no persiste nada hasta confirmar. */}
                  <CategoryPicker
                    leaves={leaves}
                    selectedTopName={effective?.name}
                    onPick={(leaf) =>
                      setOverrides((prev) => ({ ...prev, [r.match_id]: leaf.id }))
                    }
                    label={t("admin.reviewQueue.category.edit")}
                    locale={locale}
                  >
                    {effective ? (
                      <CategoryBadge slug={effective.slug} name={effective.name} locale={locale} />
                    ) : (
                      <span
                        data-testid="canonize-row-missing"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        <TriangleAlert className="size-3" />
                        {t("admin.reviewQueue.canonize.rowMissing")}
                      </span>
                    )}
                  </CategoryPicker>
                </li>
              );
            })}
          </ul>

          {/* Paginación con el MISMO lenguaje que las tablas del admin (tamaño de página, rango,
              flechas). Sin ella, cincuenta filas seleccionadas vuelven la lista un pozo de scroll
              donde revisar deja de ser posible. Se oculta cuando todo entra en una página: unos
              controles que no hacen nada son ruido. */}
          {total > pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-2.5 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                {t("admin.reviewQueue.canonize.perPage")}
                <select
                  data-testid="canonize-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setOffset(0);
                  }}
                  className="h-7 rounded-lg border border-border bg-card px-1.5 text-xs text-foreground"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {from}–{to} / {total}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={t("admin.reviewQueue.canonize.prev")}
                  disabled={page <= 1}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                  className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label={t("admin.reviewQueue.canonize.next")}
                  disabled={page >= totalPages}
                  onClick={() => setOffset(offset + pageSize)}
                  className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <Button
              type="button"
              data-testid="confirm-dismiss"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="rounded-full border-border font-medium"
            >
              {t("admin.basket.cancel")}
            </Button>
            <Button
              type="button"
              data-testid="confirm-accept"
              disabled={busy || blocked}
              onClick={() => {
                // La guarda vive acá y no solo en `disabled`: en jsdom (y con un doble clic real
                // antes del re-render) un botón deshabilitado igual recibe el evento.
                if (busy || blocked) return;
                onConfirm(fallback ?? null, overrides);
              }}
              className="gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <PackagePlus className="size-4" />
              {format(locale, "admin.reviewQueue.canonize.confirm", { n: String(rows.length) })}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import type { BasketQueryDto } from "@cuadra/api-client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui-base/table";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";

import { removeBasketQueryEntry, updateBasketQueryEntry } from "../api";
import { UNCATEGORIZED_LABEL } from "../types";

// Fila de la canasta curada — fiel a `ReviewRow` (save-matching): checkbox de selección, celda `#`
// con reorden ↑/↓, badges, y un `DropdownMenu` de acciones con el patrón de íconos `**` (gotcha #11
// de cuadra-save-admin). El label de cada acción es LIMPIO (sin el id) — el id solo se usa para el
// aria-label del trigger (targeting en tests), nunca como texto visible.
export function BasketRow({
  entry,
  selected,
  onToggleSelect,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  refresh,
  dragDisabled,
  locale,
}: {
  entry: BasketQueryDto;
  selected: boolean;
  onToggleSelect: () => void;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onEdit: () => void;
  refresh: () => Promise<void>;
  dragDisabled: boolean;
  locale: Locale;
}) {
  const { t } = useAdminI18n(locale);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: dragDisabled,
  });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ error?: unknown } | undefined | void>, msg: string) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res && "error" in res && res.error) setError(msg);
    else await refresh();
  };

  const onToggleActive = () =>
    run(() => updateBasketQueryEntry(entry.id, { active: !entry.active }), t("admin.basket.row.errToggle"));
  const onDelete = () => run(() => removeBasketQueryEntry(entry.id), t("admin.basket.row.errDelete"));

  return (
    <>
      <TableRow
        ref={setNodeRef}
        style={dragStyle}
        data-state={selected ? "selected" : undefined}
        className={`border-border/60 data-[state=selected]:bg-brand-lime/10 ${isDragging ? "relative z-10 bg-card shadow-lg" : ""}`}
      >
        <TableCell>
          <SelectCheckbox
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`${t("admin.basket.row.select")} ${entry.query_text}`}
          />
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1">
            {/* Handle de arrastre (DnD, @dnd-kit) — deshabilitado si hay orden por columna o búsqueda
                activa. Los botones ↑/↓ quedan como fallback accesible por teclado. */}
            <button
              type="button"
              aria-label={`${t("admin.basket.row.drag")} ${entry.query_text}`}
              disabled={dragDisabled}
              className="cursor-grab text-muted-foreground/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <span className="tabular-nums text-muted-foreground">{entry.position}</span>
            <div className="flex flex-col">
              <button
                type="button"
                disabled={isFirst || busy}
                onClick={() => void onMoveUp()}
                aria-label={`${t("admin.basket.row.moveUp")} ${entry.query_text}`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={isLast || busy}
                onClick={() => void onMoveDown()}
                aria-label={`${t("admin.basket.row.moveDown")} ${entry.query_text}`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          </div>
        </TableCell>

        <TableCell className="font-medium text-foreground">{entry.query_text}</TableCell>

        <TableCell>
          <span className="inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
            {entry.category_label ?? UNCATEGORIZED_LABEL}
          </span>
        </TableCell>

        <TableCell>
          {entry.active ? (
            <span className="inline-flex w-fit items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {t("admin.basket.row.active")}
            </span>
          ) : (
            <span className="inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {t("admin.basket.row.inactive")}
            </span>
          )}
        </TableCell>

        <TableCell>
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive">{t("admin.basket.row.confirmQ")}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete()}
                aria-label={`${t("admin.basket.row.confirmDeleteAria")} ${entry.query_text}`}
                className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {t("admin.basket.row.confirm")}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs text-muted-foreground">
                {t("admin.basket.cancel")}
              </button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${t("admin.basket.row.actionsAria")} ${entry.query_text}`}
                className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onEdit}
                  className="focus:bg-orange-500/10 focus:text-orange-600 not-data-[variant=destructive]:focus:**:text-orange-500 dark:focus:text-orange-400 dark:not-data-[variant=destructive]:focus:**:text-orange-400"
                >
                  <Pencil className="text-orange-500" />
                  {t("admin.basket.row.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onToggleActive()}
                  className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
                >
                  <Power className="text-blue-600 dark:text-blue-400" />
                  {entry.active ? t("admin.basket.row.deactivate") : t("admin.basket.row.activate")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 />
                  {t("admin.basket.row.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>

      {error ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="py-1">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

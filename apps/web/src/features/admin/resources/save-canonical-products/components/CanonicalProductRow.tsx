import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { Barcode, Boxes, ExternalLink, Eye, MoreHorizontal, Pencil, Archive, Store } from "lucide-react";
import { navigate } from "vike/client/router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui-base/table";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { TruncatedText } from "@/features/admin/components/TruncatedText";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import {
  MEASURE_LABEL_KEY,
  QUALITY_HINT_KEY,
  QUALITY_LABEL_KEY,
  QUALITY_PILL_CLASS,
  isQualityStatus,
} from "../lib/quality-status";
import { formatCatalogDate } from "../lib/format-date";

interface CanonicalProductRowProps {
  row: AdminCanonicalProductRowDto;
  locale: Locale;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onViewProviders: (row: AdminCanonicalProductRowDto) => void;
  onEdit: (row: AdminCanonicalProductRowDto) => void;
  /** URL pública del producto; `null` si el slug no sirve → la acción queda deshabilitada. */
  publicHref: string | null;
}

// Fila del catálogo canónico, en el mismo lenguaje que `ReviewRow` de la Cola de revisión:
// thumbnail con el nº de tiendas encima, nombre a 2 líneas con el slug debajo, badges de
// categoría/estado y un menú de acciones con íconos coloreados.
export function CanonicalProductRow({
  row,
  locale,
  selected = false,
  onToggleSelect,
  onViewProviders,
  onEdit,
  publicHref,
}: CanonicalProductRowProps) {
  const { t } = useAdminI18n(locale);
  const providers = row.matched_provider_count ?? 0;
  const completeness = row.completeness_score ?? 0;
  const detailHref = `/admin/canonical-products/${row.canonical_product_id}`;

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className="border-border/60 data-[state=selected]:bg-brand-lime/10"
    >
      {onToggleSelect ? (
        <TableCell className="w-10">
          <SelectCheckbox
            aria-label={row.name}
            checked={selected}
            onChange={() => onToggleSelect(row.canonical_product_id)}
          />
        </TableCell>
      ) : null}

      {/* Imagen + badge con el nº de tiendas SOBRE la foto (patrón de ReviewRow). */}
      <TableCell>
        <div className="relative size-12 shrink-0">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="size-12 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <Boxes className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          {providers > 0 ? (
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-brand-forest text-[10px] font-bold text-brand-lime">
              {providers}
            </span>
          ) : null}
        </div>
      </TableCell>

      {/* `max-w` va en el elemento INTERNO: en un <td> con table-layout auto el navegador
          descarta el max-width y la columna se estira hasta que el texto entra en una línea,
          con lo cual el line-clamp nunca trunca. */}
      <TableCell>
        <div className="flex max-w-[16rem] flex-col gap-0.5">
          <a
            href={detailHref}
            className="font-medium text-foreground hover:underline"
            onClick={(e) => {
              e.preventDefault();
              void navigate(detailHref);
            }}
          >
            <TruncatedText text={row.name} lines={2} />
          </a>
          <span className="truncate text-xs text-muted-foreground">{row.slug}</span>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap font-medium">{row.brand || "—"}</TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col leading-tight">
          <span>{row.display_size || "—"}</span>
          <span className="text-xs text-muted-foreground">
            {MEASURE_LABEL_KEY[row.size_measure]
              ? t(MEASURE_LABEL_KEY[row.size_measure])
              : row.size_measure}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <CategoryBadge slug={row.category} name={row.category} locale={locale} />
      </TableCell>

      {/* EAN-alcanzable: decide si el job de matcheo por código de barras puede cubrir este
          canónico, o si primero necesita que otra tienda lo siembre. */}
      <TableCell>
        {row.ean_reachable ? (
          <span
            title={t("admin.canonicalProducts.ean.reachableHint")}
            className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300"
          >
            <Barcode className="size-3" aria-hidden="true" />
            EAN
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                completeness >= 100 ? "bg-emerald-500" : "bg-brand-lime",
              )}
              style={{ width: `${completeness}%` }}
            />
          </div>
          <span className="text-sm tabular-nums">{completeness}%</span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex max-w-[13rem] flex-wrap gap-1">
          {(row.quality_statuses ?? []).map((status) => {
            const known = isQualityStatus(status);
            return (
              <span
                key={status}
                title={known ? t(QUALITY_HINT_KEY[status]) : undefined}
                className={cn(
                  "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                  known ? QUALITY_PILL_CLASS[status] : "bg-muted text-muted-foreground",
                )}
              >
                {known ? t(QUALITY_LABEL_KEY[status]) : status}
              </span>
            );
          })}
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatCatalogDate(row.last_price_seen_at, locale)}
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("admin.canonicalProducts.actions.menuLabel")}
            className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          {/* El override de color usa `**` (todos los descendientes) y NO `[&_svg]`: los íconos
              Lucide dibujan con stroke="currentColor", así que el color real lo decide el `color`
              del <path> interno — el base lo tiñe de gris vía `**:text-accent-foreground`. */}
          <DropdownMenuContent align="end" className="min-w-56 [&_[role=menuitem]]:whitespace-nowrap">
            <DropdownMenuItem
              onClick={() => void navigate(detailHref)}
              className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
            >
              <Eye className="text-emerald-600 dark:text-emerald-400" />
              {t("admin.canonicalProducts.actions.view")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onEdit(row)}
              className="focus:bg-orange-500/10 focus:text-orange-600 not-data-[variant=destructive]:focus:**:text-orange-500 dark:focus:text-orange-400 dark:not-data-[variant=destructive]:focus:**:text-orange-400"
            >
              <Pencil className="text-orange-500" />
              {t("admin.canonicalProducts.actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={providers === 0}
              onClick={() => onViewProviders(row)}
              className="focus:bg-violet-500/10 focus:text-violet-600 not-data-[variant=destructive]:focus:**:text-violet-600 dark:focus:text-violet-400 dark:not-data-[variant=destructive]:focus:**:text-violet-400"
            >
              <Store className="text-violet-600 dark:text-violet-400" />
              {t("admin.canonicalProducts.actions.providers")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!publicHref}
              onClick={() =>
                publicHref && window.open(publicHref, "_blank", "noopener,noreferrer")
              }
              className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
            >
              <ExternalLink className="text-blue-600 dark:text-blue-400" />
              {t("admin.canonicalProducts.actions.public")}
            </DropdownMenuItem>
            {/* Archivar queda DESHABILITADO con tooltip: `canonical_product` no tiene columna
                `archived_at`. El SDD es explícito — si el modelo no lo soporta, se bloquea la
                acción; improvisar un borrado destructivo acá rompería histórico y matches. */}
            <DropdownMenuItem
              disabled
              title={t("admin.canonicalProducts.actions.archiveBlocked")}
              variant="destructive"
            >
              <Archive />
              {t("admin.canonicalProducts.actions.archive")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

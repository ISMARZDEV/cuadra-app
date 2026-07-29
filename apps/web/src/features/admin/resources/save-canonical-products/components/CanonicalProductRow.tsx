import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import {
  Archive,
  ArchiveRestore,
  Barcode,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Pencil,
  Store,
} from "lucide-react";
import { navigate } from "vike/client/router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui-base/table";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { SizePill } from "@/features/admin/components/SizePill";
import { ThumbnailLightbox } from "@/features/admin/components/ThumbnailLightbox";
import { TruncatedText } from "@/features/admin/components/TruncatedText";
import { formatAdminDate, formatAdminTime } from "@/features/admin/lib/format-datetime";
import { parseSize } from "@/features/admin/lib/parse-size";
import { listCanonicalImages } from "../api";
import { formatMoney } from "@/features/save/lib/format";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import {
  QUALITY_HINT_KEY,
  QUALITY_LABEL_KEY,
  QUALITY_PILL_CLASS,
  isQualityStatus,
} from "../lib/quality-status";

interface CanonicalProductRowProps {
  row: AdminCanonicalProductRowDto;
  locale: Locale;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onViewProviders: (row: AdminCanonicalProductRowDto) => void;
  onEdit: (row: AdminCanonicalProductRowDto) => void;
  /** Abre la confirmación fuerte de archivado. Archivar NUNCA se ejecuta directo desde el menú. */
  onArchive: (row: AdminCanonicalProductRowDto) => void;
  onUnarchive: (row: AdminCanonicalProductRowDto) => void;
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
  onArchive,
  onUnarchive,
  publicHref,
}: CanonicalProductRowProps) {
  const { t } = useAdminI18n(locale);
  const providers = row.matched_provider_count ?? 0;
  const completeness = row.completeness_score ?? 0;
  const archived = Boolean(row.archived_at);
  const size = parseSize(row.display_size);
  const detailHref = `/admin/canonical-products/${row.canonical_product_id}`;

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn(
        "border-border/60 data-[state=selected]:bg-brand-lime/10",
        // Atenuada, no escondida: si el operador pidió ver archivados, tiene que distinguirlos
        // de un golpe de vista sin que desaparezcan.
        archived && "opacity-55",
      )}
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

      {/* Imagen + badge con el nº de tiendas SOBRE la foto. Clickeable: abre la galería en
          grande (`ThumbnailLightbox`), el mismo visor que la Cola de revisión. */}
      <TableCell>
        <ThumbnailLightbox
          src={row.image_url}
          alt=""
          title={row.name}
          count={providers > 0 ? providers : null}
          emptyLabel={t("admin.canonicalProducts.noImage")}
          loadImages={async () =>
            (await listCanonicalImages(row.canonical_product_id))?.map((i) => i.url) ?? []
          }
        />
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
          {archived ? (
            <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Archive className="size-3" aria-hidden="true" />
              {t("admin.canonicalProducts.archive.badge")}
            </span>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap font-medium">{row.brand || "—"}</TableCell>

      {/* Tamaño + Peso: dos columnas con el mismo par de píldoras que la Cola de revisión
          (ver `SizePill`). El número y la unidad salen de `display_size` — el tamaño tal como lo
          publica la tienda — y NO de `size_amount`/`size_measure`, que están normalizados al
          vocabulario del dominio (mass/volume/count) y no son lenguaje de operador. */}
      <TableCell>
        <SizePill value={size.amount} tone="amount" />
      </TableCell>

      <TableCell>
        <SizePill value={size.unit} tone="unit" />
      </TableCell>

      {/* Categoría: badge coloreado por el TOPE + la hoja debajo. El mapa de colores del admin
          (`category-colors.ts`) está cargado por slug de tope, así que pasarle el nombre de la
          hoja dejaba TODOS los badges en el neutro gris. La hoja no se pierde: es el dato
          específico ("Arroz") con el que el operador realmente distingue productos. */}
      <TableCell>
        <div className="flex flex-col items-start gap-0.5">
          <CategoryBadge
            slug={row.category_top_slug}
            name={row.category_top}
            locale={locale}
          />
          {/* Un nodo level-0 hace COALESCE a sí mismo en el backend (hoja === tope): repetir el
              mismo texto dos veces se lee como un bug de render, no como jerarquía. */}
          {row.category && row.category !== row.category_top ? (
            <span className="max-w-[11rem] truncate text-xs text-muted-foreground">
              {row.category}
            </span>
          ) : null}
        </div>
      </TableCell>

      {/* EAN: el CÓDIGO, no la etiqueta. El barcode es lo que el operador copia para buscar el
          producto fuera del admin; "EAN" a secas sólo repetía el nombre de la columna. La etiqueta
          queda como fallback para el canónico alcanzable cuyo código todavía no llegó. */}
      <TableCell>
        {row.ean_reachable ? (
          <span
            title={t("admin.canonicalProducts.ean.reachableHint")}
            className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 tabular-nums dark:text-sky-300"
          >
            <Barcode className="size-3 shrink-0" aria-hidden="true" />
            {row.ean || "EAN"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Precio más bajo entre las tiendas enlazadas, con el más alto debajo. Sale del MISMO
          universo que el modal de proveedores (todas las tiendas, sin filtrar disponibilidad), así
          que la columna y su drill-down no pueden contradecirse. Cuando mínimo y máximo coinciden
          se muestra UNO: repetir el mismo número sería ruido, no información. */}
      <TableCell className="whitespace-nowrap">
        {row.min_price_minor != null && row.price_currency ? (
          <div className="flex flex-col leading-tight">
            <span className="font-medium tabular-nums">
              {formatMoney(row.min_price_minor, row.price_currency)}
            </span>
            {row.max_price_minor != null && row.max_price_minor !== row.min_price_minor ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(row.max_price_minor, row.price_currency)}
              </span>
            ) : null}
          </div>
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

      {/* Fecha Y hora, el mismo par que "Fecha del match" de la Cola de revisión. Se usan las
          MISMAS funciones (`formatAdminDate`/`formatAdminTime`, fijas a UTC) y no una copia: dos
          implementaciones del mismo formato se desincronizan en cuanto alguien toca una. */}
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col leading-tight">
          <span className="text-sm text-foreground">
            {formatAdminDate(row.last_price_seen_at, locale)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatAdminTime(row.last_price_seen_at, locale)}
          </span>
        </div>
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
            {/* Archivar es SOFT-delete y abre confirmación fuerte: no borra nada, pero saca el
                producto del sitio público. Restaurar es la inversa exacta y no necesita
                confirmación — devolver algo a su estado anterior no destruye nada. */}
            {archived ? (
              <DropdownMenuItem
                onClick={() => onUnarchive(row)}
                className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
              >
                <ArchiveRestore className="text-emerald-600 dark:text-emerald-400" />
                {t("admin.canonicalProducts.actions.unarchive")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onClick={() => onArchive(row)}>
                <Archive />
                {t("admin.canonicalProducts.actions.archive")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

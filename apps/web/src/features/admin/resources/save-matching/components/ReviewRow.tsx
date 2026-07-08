import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { ImageOff, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { navigate } from "vike/client/router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui-base/table";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { MethodBadge } from "@/features/admin/components/MethodBadge";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";

import { confidenceColor } from "../lib/confidence-color";
import { formatMatchDate } from "../lib/format-match-date";
import { parseSize } from "../lib/parse-size";

interface ReviewRowProps {
  row: AdminReviewQueueRowDto;
  href: string;
  /** Locale explícito (SSR admin, ver `useAdminI18n`) — pinta `CategoryBadge`/`MethodBadge`/
   * `formatMatchDate` y las etiquetas del menú "Acciones". */
  locale: Locale;
  /** Selección para bulk-actions (batch 2e, 2.23/2.24) — omitido/`undefined` = sin checkbox
   * (mantiene el componente usable sin bulk, aunque hoy la lista siempre lo pasa). */
  selected?: boolean;
  onToggleSelect?: (matchId: string) => void;
  /** "Eliminar" del menú Acciones (Batch 6): reusa el flujo de rechazo EXISTENTE — selecciona
   * únicamente esta fila y abre el mismo panel `ReasonCodeSelect` que el bulk-reject, en vez de
   * inventar un segundo camino de rechazo. */
  onDelete: (matchId: string) => void;
}

// Fila de la cola de revisión, restyle Figma 483:12411 (Batch 6): columnas Inf. Producto (nº
// candidatos) · Producto (thumbnail+nombre+confianza) · Tamaño/Tipo Peso (parseSize) · Descripción
// (sin dato — ver flag abajo) · Categoría · Marca (texto, sin logo) · Tienda · Método · Fecha ·
// Acciones. La confianza NO es una columna del Figma, pero `confidenceColor` es una señal de
// triage SACRED (nunca un número pelado, ver `confidence-color.ts`) — se conserva como un puntito
// de color junto al nombre del producto en vez de perderla en el restyle.
export function ReviewRow({ row, href, locale, selected = false, onToggleSelect, onDelete }: ReviewRowProps) {
  const { t } = useAdminI18n(locale);
  const size = parseSize(row.store_product_size_text);

  const notifyComingSoon = () => toast(t("admin.reviewQueue.actions.comingSoon"));

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      {onToggleSelect ? (
        <TableCell>
          <input
            type="checkbox"
            data-testid={`row-select-${row.match_id}`}
            checked={selected}
            onChange={() => onToggleSelect(row.match_id)}
            aria-label={`${t("admin.reviewQueue.selectRow")} ${row.store_product_name ?? row.match_id}`}
          />
        </TableCell>
      ) : null}

      {/* Inf. Producto: badge numérico verde con el nº de candidatos ofrecidos al revisor. */}
      <TableCell>
        <span
          data-testid="candidate-count-badge"
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
        >
          {row.candidate_count}
        </span>
      </TableCell>

      {/* Producto: thumbnail redondeado (fallback = tile "sin imagen") + nombre + confianza. */}
      <TableCell>
        <div className="flex items-center gap-2">
          {row.store_product_image_url ? (
            <img
              src={row.store_product_image_url}
              alt={row.store_product_name ?? ""}
              loading="lazy"
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              role="img"
              aria-label={t("admin.reviewQueue.noImage")}
              title={t("admin.reviewQueue.noImage")}
            >
              <ImageOff className="size-4" aria-hidden="true" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                data-testid="confidence-badge"
                title={`${Math.round(row.confidence * 100)}%`}
                aria-label={`${Math.round(row.confidence * 100)}%`}
                className={`inline-block size-2 shrink-0 rounded-full ${confidenceColor(row.confidence)}`}
              />
              <a href={href} className="truncate font-medium hover:underline">
                <span data-testid="review-row-name">{row.store_product_name ?? "(sin nombre)"}</span>
              </a>
            </div>
          </div>
        </div>
      </TableCell>

      {/* Tamaño: pill verde con el número parseado de `size_text`. */}
      <TableCell>
        {size.amount ? (
          <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {size.amount}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Tipo Peso: pill verde con la unidad parseada de `size_text`. */}
      <TableCell>
        {size.unit ? (
          <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {size.unit}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Descripción: NO existe en el DTO todavía (SPEC Fase 3 — "OMITIR este round") — placeholder
          gracioso, follow-up documentado, nunca datos inventados. */}
      <TableCell>
        <span className="text-xs text-muted-foreground">{t("admin.reviewQueue.noDescription")}</span>
      </TableCell>

      <TableCell>
        <CategoryBadge slug={row.category?.slug} name={row.category?.name} locale={locale} />
      </TableCell>

      {/* Marca: texto plano — no hay logo de marca todavía (SPEC Fase 3, follow-up). */}
      <TableCell className="text-muted-foreground">{row.store_product_brand ?? "—"}</TableCell>

      <TableCell>
        <ProviderLogo name={row.provider_name} logoUrl={row.provider_logo_url} />
      </TableCell>

      <TableCell>
        <MethodBadge method={row.method} locale={locale} />
      </TableCell>

      <TableCell className="text-muted-foreground">{formatMatchDate(row.created_at, locale)}</TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("admin.reviewQueue.actions.menuLabel")}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void navigate(href)}>
              {t("admin.reviewQueue.actions.view")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={notifyComingSoon}>
              {t("admin.reviewQueue.actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={notifyComingSoon}>
              {t("admin.reviewQueue.actions.share")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.match_id)}>
              {t("admin.reviewQueue.actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

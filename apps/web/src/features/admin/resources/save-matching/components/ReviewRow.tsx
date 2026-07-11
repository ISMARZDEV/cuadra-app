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
import { providerLogoByName } from "@/features/save/lib/provider-logos";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import type { Locale } from "@/i18n/config";

import { confidencePillClass } from "../lib/confidence-color";
import { formatMatchDate, formatMatchTime } from "../lib/format-match-date";
import { SelectCheckbox } from "./SelectCheckbox";
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

// Fila de la cola de revisión, fiel al Figma 483:12419. Columnas: Confianza (pill % por banda) ·
// Imagen (thumbnail + badge del nº de candidatos SOBRE la foto) · Producto (nombre 2 líneas) ·
// Tamaño/Peso (parseSize) · Descripción (placeholder — sin dato en el DTO) · Categoría · Marca
// (texto) · Tienda (logo) · Método · Fecha del match (2 líneas: fecha + hora) · Acciones.
export function ReviewRow({ row, href, locale, selected = false, onToggleSelect, onDelete }: ReviewRowProps) {
  const { t } = useAdminI18n(locale);
  const size = parseSize(row.store_product_size_text);
  const confidencePct = row.confidence === null ? "N/A" : `${Math.round(row.confidence * 100)}%`;
  // Logo de marca bundleado por nombre (mismo repositorio que los de tienda, `provider-logos`) —
  // undefined si no hay uno conocido → se cae al texto de la marca (Figma: logo GOYA/… o texto N/A).
  const brandLogo = row.store_product_brand ? providerLogoByName(row.store_product_brand) : undefined;

  const notifyComingSoon = () => toast(t("admin.reviewQueue.actions.comingSoon"));

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className="border-border/60 data-[state=selected]:bg-brand-lime/10"
    >
      {onToggleSelect ? (
        <TableCell>
          <SelectCheckbox
            data-testid={`row-select-${row.match_id}`}
            checked={selected}
            onChange={() => onToggleSelect(row.match_id)}
            aria-label={`${t("admin.reviewQueue.selectRow")} ${row.store_product_name ?? row.match_id}`}
          />
        </TableCell>
      ) : null}

      {/* Confianza: pill % coloreado por banda de matching (85/94 verde, 55 ámbar, 26 rojo). */}
      <TableCell>
        <span
          data-testid="confidence-badge"
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${confidencePillClass(row.confidence)}`}
        >
          {confidencePct}
        </span>
      </TableCell>

      {/* Imagen: thumbnail redondeado con el nº de candidatos como badge sobre la esquina. */}
      <TableCell>
        <div className="relative size-11 shrink-0">
          {row.store_product_image_url ? (
            <img
              src={row.store_product_image_url}
              alt={row.store_product_name ?? ""}
              loading="lazy"
              className="size-11 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              role="img"
              aria-label={t("admin.reviewQueue.noImage")}
              title={t("admin.reviewQueue.noImage")}
            >
              <ImageOff className="size-4" aria-hidden="true" />
            </div>
          )}
          <span
            data-testid="candidate-count-badge"
            className="absolute -top-1.5 -right-1.5 flex size-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-card"
          >
            {row.candidate_count}
          </span>
        </div>
      </TableCell>

      {/* Producto: nombre en 2 líneas, enlaza al detalle. */}
      <TableCell>
        <a href={href} className="line-clamp-2 max-w-[13rem] font-semibold text-foreground hover:underline">
          <span data-testid="review-row-name">{row.store_product_name ?? "(sin nombre)"}</span>
        </a>
      </TableCell>

      {/* Tamaño: pill teal RELLENO con el número (Figma 483:12422 — bg #007e62, texto lima #c2fb7e). */}
      <TableCell>
        {size.amount ? (
          <span className="inline-flex w-fit items-center rounded-full bg-[#007e62] px-2.5 py-1 text-xs font-bold text-[#c2fb7e]">
            {size.amount}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Peso: pill lima con la unidad (Figma — bg brand-lime #bbec6c, texto verde #3f6942). */}
      <TableCell>
        {size.unit ? (
          <span className="inline-flex w-fit items-center rounded-full bg-brand-lime px-2.5 py-1 text-xs font-bold text-[#3f6942]">
            {size.unit}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Descripción: NO existe en el DTO todavía (SPEC Fase 3) — placeholder, follow-up documentado. */}
      <TableCell>
        <span className="text-xs text-muted-foreground">{t("admin.reviewQueue.noDescription")}</span>
      </TableCell>

      <TableCell>
        <CategoryBadge slug={row.category?.slug} name={row.category?.name} locale={locale} />
      </TableCell>

      {/* Marca: logo bundleado por nombre si existe (Figma — GOYA/…), si no el texto de la marca. */}
      <TableCell className="text-center">
        {brandLogo ? (
          <img
            src={brandLogo}
            alt={row.store_product_brand ?? ""}
            loading="lazy"
            className="mx-auto max-h-6 max-w-20 object-contain"
          />
        ) : (
          <span className="text-xs font-bold text-foreground/80">{row.store_product_brand ?? "N/A"}</span>
        )}
      </TableCell>

      <TableCell>
        <ProviderLogo name={row.provider_name} logoUrl={row.provider_logo_url} />
      </TableCell>

      <TableCell>
        <MethodBadge method={row.method} locale={locale} />
      </TableCell>

      {/* Fecha del match: 2 líneas (fecha arriba, hora abajo). */}
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col leading-tight">
          <span className="text-foreground">{formatMatchDate(row.created_at, locale)}</span>
          <span className="text-xs text-muted-foreground">{formatMatchTime(row.created_at, locale)}</span>
        </div>
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("admin.reviewQueue.actions.menuLabel")}
            className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
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

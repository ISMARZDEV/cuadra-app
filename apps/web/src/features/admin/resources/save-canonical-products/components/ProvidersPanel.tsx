import type { AdminCanonicalProviderPriceDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { ExternalLink, MoreHorizontal, Search, Star, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminDateTime } from "@/features/admin/components/AdminDateTime";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { formatMoney } from "@/features/save/lib/format";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { providerStats, rowStanding, type ProviderStats } from "../lib/provider-stats";

import { ProviderRowActions } from "./ProviderRowActions";
import {
  discardStoreProduct,
  promoteStoreProduct,
  relinkStoreProduct,
  unlinkStoreProduct,
} from "../api";
import { ADMIN_DECIDED_BY } from "@/features/admin/resources/save-matching/lib/decided-by";

type T = (key: MessageKey) => string;

/** Arranca en 10 como la lista canónica; el 5 existe porque un canónico rara vez pasa de 5 tiendas. */
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/**
 * Las tiendas que venden este canónico: cuatro tiles de resumen + la tabla.
 *
 * Sigue el lenguaje visual de la Cola de revisión y de Sources (tarjeta `rounded-2xl`, pill de
 * búsqueda, trigger de acciones lima) para que el detalle no se lea "de otra app".
 *
 * El pie es el mismo de `SourcesScreen` y de la lista canónica (tamaño de página + rango + páginas
 * numeradas). Hoy un canónico trae tres a cinco tiendas y cabe entero en la primera página, pero
 * el control mantiene la consola coherente y ya está listo para un canónico con decenas de
 * tiendas — que es justo lo que pasa cuando se suman cadenas.
 *
 * El rango y la página se DERIVAN de la lista filtrada en cada render, sin efecto que sincronice:
 * al filtrar, quedarse en la página 2 dejaría la tabla vacía teniendo resultados.
 */
export function ProvidersPanel({
  providers,
  locale,
  t,
  canonicalProductId,
  taxonomyLeaves = [],
  onProvidersChanged,
}: {
  providers: AdminCanonicalProviderPriceDto[];
  locale: Locale;
  t: T;
  /** Requerido para las acciones por fila. Sin él, el menú solo ofrece "Abrir". */
  canonicalProductId?: string;
  /** Hojas de la taxonomía para "crear canónico nuevo" (#4). */
  taxonomyLeaves?: TaxonomyLeafDto[];
  /** Se llama tras una mutación exitosa para que la pantalla recargue la tabla. */
  onProvidersChanged?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);

  // Los tiles se calculan sobre TODAS las tiendas, nunca sobre lo filtrado: resumen el abanico
  // real de precios, y que "Precio más bajo" cambiara al escribir en el buscador sería mentira.
  const stats = useMemo(() => providerStats(providers), [providers]);

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.provider_name.toLowerCase().includes(q));
  }, [providers, search]);

  const total = matching.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Filtrar o achicar la página puede dejar el índice fuera de rango; sin este tope la tabla se
  // vería vacía teniendo resultados. Se DERIVA en vez de sincronizarse con un efecto.
  const currentPage = Math.min(page, totalPages);
  const visible = matching.slice((currentPage - 1) * limit, currentPage * limit);
  const from = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const to = Math.min(currentPage * limit, total);

  if (!stats) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {t("admin.canonicalProducts.providers.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.canonicalDetail.providers.search")}
            aria-label={t("admin.canonicalDetail.providers.search")}
            className="h-9 w-[272px] rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pl-9"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          testId="tile-lowest"
          icon={<Star className="size-5" aria-hidden />}
          label={t("admin.canonicalDetail.providers.lowest")}
          value={formatMoney(stats.minMinor, stats.currency)}
          tone="good"
        />
        <Tile
          testId="tile-highest"
          icon={<TrendingUp className="size-5" aria-hidden />}
          label={t("admin.canonicalDetail.providers.highest")}
          value={formatMoney(stats.maxMinor, stats.currency)}
          tone="warn"
        />
        <Tile
          testId="tile-spread"
          label={t("admin.canonicalDetail.providers.spread")}
          value={formatMoney(stats.spreadMinor, stats.currency)}
          tone="plain"
        />
        <Tile
          testId="tile-stores"
          label={t("admin.canonicalDetail.providers.activeStores")}
          value={String(stats.activeCount)}
          tone="plain"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
        {/* El scroll horizontal va ADENTRO de la tarjeta con `overflow-hidden`: sin él, las
            columnas de la derecha se recortan sin forma de llegar a ellas. */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("admin.canonicalDetail.providers.col.store")}</TableHead>
                <TableHead>{t("admin.canonicalDetail.providers.col.standing")}</TableHead>
                <TableHead className="text-right">
                  {t("admin.canonicalDetail.providers.col.currentPrice")}
                </TableHead>
                {/* En el mockup esta columna también decía "Precio Actual". */}
                <TableHead className="text-right">
                  {t("admin.canonicalDetail.providers.col.previousPrice")}
                </TableHead>
                <TableHead className="text-right">
                  {t("admin.canonicalDetail.providers.col.difference")}
                </TableHead>
                <TableHead>{t("admin.canonicalProducts.providers.col.lastSeen")}</TableHead>
                <TableHead className="text-right">
                  {t("admin.canonicalDetail.providers.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <Row
                  key={row.store_product_id}
                  row={row}
                  stats={stats}
                  locale={locale}
                  t={t}
                  canonicalProductId={canonicalProductId}
                  taxonomyLeaves={taxonomyLeaves}
                  onProvidersChanged={onProvidersChanged}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("admin.canonicalDetail.providers.noMatch")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{t("admin.canonicalProducts.pagination.show")}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => {
                setLimit(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{t("admin.canonicalProducts.pagination.perPage")}</span>
          </div>

          <span data-testid="providers-range">
            {format(locale, "admin.canonicalProducts.pagination.of", {
              from: String(from),
              to: String(to),
              total: String(total),
            })}
          </span>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  aria-disabled={currentPage <= 1}
                  className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {pageWindow(currentPage, totalPages).map((n) => (
                <PaginationItem key={n}>
                  <PaginationLink isActive={n === currentPage} onClick={() => setPage(n)}>
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  aria-disabled={currentPage >= totalPages}
                  className={
                    currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}

/** Ventana deslizante de páginas — mismo helper que la lista canónica y Sources. */
function pageWindow(current: number, total: number, max = 5): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = start + max - 1;
  if (end > total) {
    end = total;
    start = end - max + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function Tile({
  testId,
  icon,
  label,
  value,
  tone,
}: {
  testId: string;
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone: "good" | "warn" | "plain";
}) {
  const tones = {
    good: "border-brand-lime bg-brand-lime/25 text-brand-forest dark:text-brand-lime",
    warn: "border-amber-300 bg-amber-100/70 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
    plain: "border-border bg-white dark:bg-card",
  } as const;
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex min-w-0 items-center justify-center gap-2 rounded-xl border p-3",
        tones[tone],
      )}
    >
      {icon}
      <div className="min-w-0 text-center">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="truncate text-xs font-medium opacity-80">{label}</p>
      </div>
    </div>
  );
}

function Row({
  row,
  stats,
  locale,
  t,
  canonicalProductId,
  taxonomyLeaves,
  onProvidersChanged,
}: {
  row: AdminCanonicalProviderPriceDto;
  stats: ProviderStats;
  locale: Locale;
  t: T;
  canonicalProductId?: string;
  taxonomyLeaves: TaxonomyLeafDto[];
  onProvidersChanged?: () => void;
}) {
  const standing = rowStanding(row, stats);

  return (
    <TableRow data-testid={`row-${row.store_product_id}`}>
      <TableCell>
        <ProviderLogo
          name={row.provider_name}
          logoUrl={row.provider_logo_url}
          className="max-h-7 max-w-16 object-contain"
        />
      </TableCell>

      <TableCell>
        {standing.kind === "cheapest" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-lime/35 px-2 py-0.5 text-xs font-semibold text-brand-forest dark:text-brand-lime">
            {t("admin.canonicalDetail.providers.bestPrice")}
          </span>
        ) : standing.kind === "priciest" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            {t("admin.canonicalDetail.providers.priciest")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-right font-semibold tabular-nums">
        {formatMoney(row.price_minor, row.currency)}
      </TableCell>

      <TableCell className="text-right">
        {row.previous_price_minor ? (
          <span
            data-testid="row-previous-price"
            className="tabular-nums text-muted-foreground line-through"
          >
            {formatMoney(row.previous_price_minor, row.currency)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Sólo el signo, sin "más caro": la palabra repite lo que ya dice el `+` bajo un
          encabezado que dice "Diferencia", y costaba el ancho que le faltaba a Acciones. El
          texto completo queda en el `title` para quien lo necesite. */}
      <TableCell className="text-right text-xs whitespace-nowrap">
        {standing.deltaMinor === 0 ? (
          <span className="font-semibold text-brand-forest dark:text-brand-lime">
            {t("admin.canonicalDetail.providers.same")}
          </span>
        ) : (
          <span
            className="font-semibold text-amber-700 dark:text-amber-300"
            title={`${formatMoney(standing.deltaMinor, row.currency)} ${t(
              "admin.canonicalDetail.providers.pricier",
            )}`}
          >
            +{formatMoney(standing.deltaMinor, row.currency)}
          </span>
        )}
      </TableCell>

      {/* El par fecha/hora del admin (`AdminDateTime`), como en la Cola de revisión: saber si un
          precio se leyó hace diez minutos o esta mañana cambia si conviene esperar la corrida. */}
      <TableCell className="text-xs">
        <AdminDateTime iso={row.last_seen_at} locale={locale} />
      </TableCell>

      <TableCell className="text-right">
        {canonicalProductId ? (
          <ProviderRowActions
            canonicalProductId={canonicalProductId}
            row={row}
            leaves={taxonomyLeaves}
            locale={locale}
            t={t}
            decidedBy={ADMIN_DECIDED_BY}
            onDone={() => onProvidersChanged?.()}
            onDiscard={(spId) => discardStoreProduct(canonicalProductId, spId, ADMIN_DECIDED_BY)}
            onUnlink={(spId, body) =>
              unlinkStoreProduct(canonicalProductId, spId, {
                ...body,
                decided_by: ADMIN_DECIDED_BY,
              })
            }
            onRelink={(spId, targetId) =>
              relinkStoreProduct(canonicalProductId, spId, {
                canonical_product_id: targetId,
                decided_by: ADMIN_DECIDED_BY,
              })
            }
            onPromote={(spId, taxonomyNodeId) =>
              promoteStoreProduct(canonicalProductId, spId, {
                taxonomy_node_id: taxonomyNodeId,
                decided_by: ADMIN_DECIDED_BY,
              })
            }
          />
        ) : (
          /* Sin `canonicalProductId` no hay a qué canónico referirse, así que las cuatro acciones
             no tienen sentido y solo queda "Abrir". Pasa en tests y en cualquier uso del panel
             fuera del detalle: mejor degradar que romper. */
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("admin.canonicalDetail.providers.col.actions")}
              className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem
                disabled={!row.url}
                onClick={() => row.url && window.open(row.url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-4" />
                {t("admin.canonicalProducts.providers.open")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

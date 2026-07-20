import type { AssetAdminRowDto } from "@cuadra/api-client";
import { AlertTriangle, Boxes, Info } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui-base/tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TruncatedText } from "@/features/admin/components/TruncatedText";
import { formatAdminDateTime } from "@/features/admin/lib/format-datetime";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { listPipelineAssets } from "../api";

type T = (key: MessageKey) => string;

/** Los 4 estados de salud vienen del DOMINIO (`PipelineAsset.health`). Acá SOLO se traducen: derivar
 * la salud en el front la desincronizaría del detalle por proveedor (#11), que va a leer la misma. */
const HEALTH_KEY: Record<string, MessageKey> = {
  never_materialized: "admin.orchestration.assets.health.never_materialized",
  healthy: "admin.orchestration.assets.health.healthy",
  degraded: "admin.orchestration.assets.health.degraded",
  failed: "admin.orchestration.assets.health.failed",
};

const HEALTH_TONE: Record<string, string> = {
  // "Nunca materializado" es NEUTRO, no una alarma: un asset recién desplegado está sano.
  never_materialized: "bg-muted text-muted-foreground",
  healthy: "bg-brand-lime/30 text-brand-forest dark:text-brand-lime",
  degraded: "bg-amber-200/40 text-amber-900 dark:text-amber-200",
  failed: "bg-red-200/40 text-red-900 dark:text-red-200",
};

/** De QUÉ son las partes. Lo declara el DOMINIO (`AssetPartitionKind`); acá solo se elige la
 * palabra. `other` es la salida honesta para una partición que nadie mapeó: "partes" es cierto
 * aunque sea vago, y es mejor que inventarle un nombre. */
const PARTS_NOUN_KEY: Record<string, MessageKey> = {
  provider: "admin.orchestration.assets.partsProvider",
  section: "admin.orchestration.assets.partsSection",
  other: "admin.orchestration.assets.partsOther",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/** Ventana de páginas alrededor de la actual (evita pintar 40 botones). Misma que la consola. */
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

/** Tres estados REALMENTE distintos, y ninguno se puede confundir con otro:
 *  - `loading`      — se está preguntando
 *  - `unavailable`  — NO se pudo preguntar (runner caído)  → nunca una lista vacía
 *  - `ready`        — el runner contestó (la lista puede estar legítimamente vacía)
 */
type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; assets: AssetAdminRowDto[] };

export function AssetsTab({ t, locale }: { t: T; locale: Locale }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let alive = true;
    listPipelineAssets()
      .then((assets) => alive && setState({ kind: "ready", assets }))
      .catch(() => alive && setState({ kind: "unavailable" }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {t("admin.orchestration.assets.loading")}
      </p>
    );
  }

  // El runner no respondió. Se DECLARA — jamás se pinta una tabla vacía, que diría "el pipeline no
  // tiene assets" cuando la verdad es "no pudimos preguntar". Es la mentira más cara del módulo.
  if (state.kind === "unavailable") {
    return (
      <div
        data-testid="assets-unavailable"
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center"
      >
        <AlertTriangle className="size-6 text-amber-600" aria-hidden />
        <p className="text-sm font-semibold text-foreground">
          {t("admin.orchestration.assets.unavailableTitle")}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {t("admin.orchestration.assets.unavailableHint")}
        </p>
      </div>
    );
  }

  const assets = state.kind === "ready" ? state.assets : [];
  const total = assets.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const pageRows = assets.slice(offset, offset + limit);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(limit)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, limit].sort((a, b) => a - b);

  if (state.assets.length === 0) {
    return (
      <div
        data-testid="assets-empty"
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center"
      >
        <Boxes className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("admin.orchestration.assets.empty")}</p>
      </div>
    );
  }

  return (
    // `overflow-hidden` en el card (lo pide el radio) + `overflow-x-auto` DENTRO: sin el segundo,
    // una descripción larga ensancha la tabla y las 5 columnas de la derecha se RECORTAN en
    // silencio — están en el DOM, invisibles y sin scroll. Pasó de verdad: la tab se veía como una
    // lista de una sola columna. Ningún test lo ve, porque los nodos existen.
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
            <TableHead>{t("admin.orchestration.assets.colAsset")}</TableHead>
            <TableHead>{t("admin.orchestration.assets.colGroup")}</TableHead>
            <TableHead>{t("admin.orchestration.assets.colJobs")}</TableHead>
            <TableHead>
              {/* El icono es el afford: un tooltip colgado del texto pelado de la cabecera es
                  invisible — nadie pasa el mouse por una etiqueta a ver si pasa algo. */}
              <span className="inline-flex items-center gap-1">
                {t("admin.orchestration.assets.colPartitions")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="inline-flex cursor-help" />}
                      data-testid="partitions-help"
                    >
                      <Info className="size-3.5 text-muted-foreground" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs leading-relaxed">
                      {t("admin.orchestration.assets.partitionsHelp")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </TableHead>
            <TableHead>{t("admin.orchestration.assets.colLastRun")}</TableHead>
            <TableHead>{t("admin.orchestration.assets.colHealth")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((a) => (
            <TableRow key={a.key}>
              <TableCell className="align-top">
                {/* El ancho se acota en un DIV interno, NO en el `<TableCell>`: por spec, con
                    `table-layout: auto` (el default) el navegador dimensiona las columnas por
                    CONTENIDO y **descarta el `max-width` de un `<td>`**. Puesto en la celda, la
                    columna se ensanchaba hasta meter la descripción en UNA línea → `line-clamp`
                    nunca recortaba (sin `…`) y `scrollHeight === clientHeight`, así que el tooltip
                    tampoco se activaba nunca. Mismo patrón que `ReviewRow` (`max-w-[13rem]` sobre
                    el <a>, no sobre la celda). */}
                <div className="max-w-[380px]">
                  <span className="font-semibold text-foreground">{a.key}</span>
                  <TruncatedText
                    text={a.description}
                    className="mt-0.5 text-xs text-muted-foreground"
                  />
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{a.group || "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {a.job_names.length > 0 ? a.job_names.join(", ") : "—"}
              </TableCell>
              <TableCell>
                {/* AUSENTE cuando el asset no está particionado. Un `0/0` afirmaría una cobertura
                    del 0% sobre algo que no tiene cobertura definida. */}
                {a.partitions ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={<span className="cursor-help" />}>
                        <span data-testid={`asset-partitions-${a.key}`} className="text-foreground">
                          {a.partitions.materialized}/{a.partitions.total}
                          <span className="ml-1 inline-block text-xs text-muted-foreground first-letter:uppercase">
                            {t(
                              PARTS_NOUN_KEY[a.partitions.kind] ??
                                "admin.orchestration.assets.partsOther",
                            )}
                          </span>
                          {a.partitions.failed > 0 ? (
                            <span className="ml-1 text-xs text-red-600 dark:text-red-300">
                              {format(locale, "admin.orchestration.assets.failedCount", {
                                count: String(a.partitions.failed),
                              })}
                            </span>
                          ) : null}
                        </span>
                      </TooltipTrigger>
                      {/* `3/4` no dice de QUÉ son esas partes. El detalle traduce el número a
                          lenguaje, que es lo que el operador necesita para decidir si urge. */}
                      <TooltipContent className="max-w-xs leading-relaxed">
                        {format(locale, "admin.orchestration.assets.partitionsDetail", {
                          materialized: String(a.partitions.materialized),
                          total: String(a.partitions.total),
                          noun: t(
                            PARTS_NOUN_KEY[a.partitions.kind] ??
                              "admin.orchestration.assets.partsOther",
                          ),
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={<span className="cursor-help" />}>
                        <span className="text-muted-foreground">—</span>
                      </TooltipTrigger>
                      {/* Un `—` sin explicación se lee como "falta el dato". Acá significa algo
                          distinto y concreto: este asset NO está particionado. */}
                      <TooltipContent className="max-w-xs leading-relaxed">
                        {t("admin.orchestration.assets.partitionsNone")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatAdminDateTime(a.last_materialized_at, locale)}
              </TableCell>
              <TableCell>
                <span
                  data-testid={`asset-health-${a.key}`}
                  className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${
                    HEALTH_TONE[a.health] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {t(HEALTH_KEY[a.health] ?? "admin.orchestration.assets.health.never_materialized")}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {/* Pie de paginación — mismo patrón que la tab Proveedores y que Fuentes, para que el admin no
          termine con dos gramáticas de tabla distintas. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{t("admin.orchestration.pagination.show")}</span>
          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setOffset(0); }}>
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
          <span>{t("admin.orchestration.pagination.perPage")}</span>
        </div>

        <span data-testid="assets-pagination-range">
          {format(locale, "admin.orchestration.pagination.of", {
            from: String(from),
            to: String(to),
            total: String(total),
          })}
        </span>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setOffset(Math.max(0, offset - limit))}
                aria-disabled={currentPage <= 1}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {pageWindow(currentPage, totalPages).map((pg) => (
              <PaginationItem key={pg}>
                <PaginationLink
                  isActive={pg === currentPage}
                  onClick={() => setOffset((pg - 1) * limit)}
                >
                  {pg}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setOffset(offset + limit)}
                aria-disabled={currentPage >= totalPages}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

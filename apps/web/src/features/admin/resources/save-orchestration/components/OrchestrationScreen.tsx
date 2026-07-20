import type { ProviderFlowDto } from "@cuadra/api-client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "vike-react/useData";

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import {
  cancelRun,
  deletePolicy,
  listProviderFlowEntries,
  pausePolicy,
  resumePolicy,
  retryRun,
  runPolicy,
} from "../api";
import type { OrchestrationData } from "../interfaces";
import { filterFlows, type FlowFilters } from "../lib/filter-flows";
import { isInFlight } from "../lib/run-state";
import { AssetsTab } from "./AssetsTab";
import { CreateFlowModal } from "./CreateFlowModal";
import { OrchestrationKpis } from "./OrchestrationKpis";
import { OrchestrationRow } from "./OrchestrationRow";
import { OrchestrationTabs, type OrchestrationTab } from "./OrchestrationTabs";
import { OrchestrationToolbar } from "./OrchestrationToolbar";
import { PolicyModal } from "./PolicyModal";

type T = (key: MessageKey) => string;

/** Cadencia del refresco en vivo. Suficiente para que la tabla "se mueva" sin machacar al runner:
 * cada tick es una consulta GraphQL por flujo. Solo corre si hay algo en vuelo. */
const LIVE_POLL_MS = 5_000;

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

/** Ventana de páginas alrededor de la actual (evita pintar 40 botones). */
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

/** Qué confirmación está abierta. `null` = ninguna. */
type Pending =
  | { kind: "cancel"; policyId: string; runId: string }
  | { kind: "delete"; policyId: string }
  | null;

// Consola de Orquestación (F4 + rediseño v2). Opera el Descubrimiento sin salir del admin.
//
// DOS tabs (§14 #9+#10): "Proveedores" (policies, por SSR) y "Assets Dagster" (el pipeline completo,
// pedido al abrir la pestaña). La barra de tabs nació junto con la segunda: una tab sola es decorado.
//
// Por qué los assets NO viajan en el `+data.ts`: las policies viven en NUESTRA DB y por eso la lista
// degrada con el runner caído, pero los assets viven SOLO en Dagster y su endpoint responde 503. Si
// entraran por SSR, un runner muerto tumbaría la consola ENTERA — justo cuando el operador más
// necesita mirar la configuración.
export function OrchestrationScreen() {
  const {
    flows: initialFlows,
    runnerDisconnected,
    providers = [],
    locale = DEFAULT_LOCALE,
  } = useData<OrchestrationData & { locale?: Locale }>();
  const { t } = useAdminI18n(locale);
  const { items: flows, refresh } = useAdminList(initialFlows, listProviderFlowEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [editing, setEditing] = useState<ProviderFlowDto["policy"] | null>(null);
  const [tab, setTab] = useState<OrchestrationTab>("flows");
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState<FlowFilters>({ search: "" });

  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  const visible = useMemo(() => filterFlows(flows, filters), [flows, filters]);

  const total = visible.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const pageRows = useMemo(() => visible.slice(offset, offset + limit), [visible, offset, limit]);
  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  const pageSizeOptions = PAGE_SIZE_OPTIONS.includes(limit)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, limit].sort((a, b) => a - b);

  // Filtrar o cambiar el tamaño de página vuelve a la primera: quedarse en la página 4 de un
  // resultado que ahora tiene una sola muestra una tabla vacía que parece un error.
  useEffect(() => {
    setOffset(0);
  }, [filters, limit]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Refresco EN VIVO mientras alguna corrida siga en vuelo. Sin esto el operador lanza y se queda
  // mirando una tabla congelada, sin saber si pasó algo.
  //
  // La guarda importa tanto como el polling: si NADA está en vuelo no se programa ningún tick, así
  // que la consola en reposo no le cuesta nada al runner. `unknown` NO cuenta como en vuelo — no
  // cambia solo, y refrescar por él sería machacar el runner para siempre (ver `isInFlight`).
  const live = flows.some((f) => isInFlight(f.last_run_state));
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void refresh(), LIVE_POLL_MS);
    return () => clearInterval(id);
    // `refresh` es estable en la práctica (viene de `useAdminList`); lo que gobierna es `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const onConfirm = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === "cancel") await act(p.policyId, () => cancelRun(p.runId));
    else await act(p.policyId, () => deletePolicy(p.policyId));
  };

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
        {/* Header — mismo patrón que Fuentes/Canasta: título + contador entre paréntesis. */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">
            {t("admin.orchestration.title")}
          </h1>
          <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">
            ({flows.length})
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t("admin.orchestration.subtitle")}</p>

        {/* §14 #10. La barra nace JUNTO con la tab de Assets: una pestaña sola no es una elección. */}
        <OrchestrationTabs active={tab} onChange={setTab} t={t} />

        {tab === "assets" ? (
          // Los assets se piden al ABRIR la tab, no por SSR: viven solo en Dagster, así que un 503
          // del runner tumbaría la consola entera — incluidas las policies, que viven en nuestra DB
          // y tienen que seguir visibles justo cuando el runner falla (SDD §8).
          <AssetsTab t={t} locale={locale} />
        ) : (
          <>
        {runnerDisconnected && (
          // Estado DEGRADADO explícito, no un error. La política sigue visible y editable porque
          // vive en NUESTRA DB — es justo cuando el operador más necesita mirarla. Y lo declara el
          // backend (`runner_available`), no lo infiere el front: un flujo que nunca corrió se ve
          // idéntico a un runner muerto.
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            {t("admin.orchestration.runnerDown")}
          </div>
        )}

        {/* Los KPIs resumen TODOS los flujos, no los filtrados: son el estado de la operación, no
            del filtro. Si cambiaran con el buscador dejarían de ser un indicador y pasarían a ser
            un reflejo de lo que el operador está mirando. */}
        <OrchestrationKpis flows={flows} degraded={runnerDisconnected} t={t} locale={locale} />

        <OrchestrationToolbar
          filters={filters}
          onFiltersChange={setFilters}
          onCreate={() => setCreating(true)}
          t={t}
        />

        {flows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("admin.orchestration.empty")}
          </div>
        ) : visible.length === 0 ? (
          // Vacío por FILTRO ≠ vacío por falta de datos. Decirle "creá uno para empezar" a alguien
          // que solo escribió mal una búsqueda es mentirle sobre el estado del sistema.
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("admin.orchestration.emptySearch")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                  <TableHead>{t("admin.orchestration.col.status")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.provider")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.flow")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.schedule")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.nextRun")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.products")}</TableHead>
                  <TableHead>{t("admin.orchestration.col.outcome")}</TableHead>
                  <TableHead className="text-right">{t("admin.orchestration.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((flow) => (
                  <OrchestrationRow
                    key={flow.policy.policy_id}
                    flow={flow}
                    t={t}
                    locale={locale}
                    busy={busyId === flow.policy.policy_id}
                    onRun={() => void act(flow.policy.policy_id, () => runPolicy(flow.policy.policy_id))}
                    onRetry={() =>
                      flow.last_run_id &&
                      void act(flow.policy.policy_id, () => retryRun(flow.last_run_id!))
                    }
                    onCancel={() =>
                      flow.last_run_id &&
                      setPending({
                        kind: "cancel",
                        policyId: flow.policy.policy_id,
                        runId: flow.last_run_id,
                      })
                    }
                    onEdit={() => setEditing(flow.policy)}
                    onToggle={() =>
                      void act(flow.policy.policy_id, () =>
                        flow.policy.enabled
                          ? pausePolicy(flow.policy.policy_id)
                          : resumePolicy(flow.policy.policy_id),
                      )
                    }
                    onDelete={() => setPending({ kind: "delete", policyId: flow.policy.policy_id })}
                  />
                ))}
              </TableBody>
            </Table>

            {/* Footer de paginación — mismo patrón que Fuentes: tamaño de página, rango y páginas.
                Pagina lo FILTRADO, no la lista cruda: el rango tiene que cuadrar con lo que se ve. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>{t("admin.orchestration.pagination.show")}</span>
                <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
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

              <span data-testid="pagination-range">
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
        )}
          </>
        )}
      </div>

      {/* Confirmación fuerte. Cancelar una corrida en vuelo o retirar un flujo no pueden ser un clic
          distraído — y el copy explica el IMPACTO, no pregunta "¿estás seguro?". */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        destructive={pending?.kind === "delete"}
        busy={busyId !== null}
        title={t(
          pending?.kind === "delete"
            ? "admin.orchestration.confirm.delete.title"
            : "admin.orchestration.confirm.cancel.title",
        )}
        description={t(
          pending?.kind === "delete"
            ? "admin.orchestration.confirm.delete.body"
            : "admin.orchestration.confirm.cancel.body",
        )}
        confirmLabel={t(
          pending?.kind === "delete"
            ? "admin.orchestration.confirm.delete.accept"
            : "admin.orchestration.confirm.cancel.accept",
        )}
        cancelLabel={t("admin.orchestration.confirm.back")}
        onConfirm={() => void onConfirm()}
      />

      {editing ? (
        <PolicyModal
          policy={editing}
          onClose={() => setEditing(null)}
          refresh={refresh}
          t={t}
          locale={locale}
        />
      ) : null}

      {creating ? (
        <CreateFlowModal
          providers={providers}
          // Un proveedor que ya tiene flujo no se ofrece: la policy es única por
          // (provider, market, flow) y una PAUSADA sigue ocupando el lugar.
          existingProviderIds={flows
            .map((f) => f.policy.provider_id)
            .filter((id): id is string => id != null)}
          onClose={() => setCreating(false)}
          refresh={refresh}
          t={t}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

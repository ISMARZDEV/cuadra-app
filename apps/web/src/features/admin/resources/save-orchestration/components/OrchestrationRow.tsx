import type { ProviderFlowDto } from "@cuadra/api-client";

import { TableCell, TableRow } from "@/components/ui-base/table";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { runQueueHref } from "../lib/run-queue-href";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { OrchestrationActionsMenu } from "./OrchestrationActionsMenu";

type T = (key: MessageKey) => string;

// Fila de la consola de Orquestación, alineada al lenguaje del admin (`ReviewRow`/`SourceRow`):
// logo de proveedor, dos líneas donde aporta, y el menú de acciones redondo al final.
//
// El PROVEEDOR va primero (después del estado) porque con `flow_key` al frente las tres filas de
// `provider_prices_refresh` se ven idénticas y el operador no sabe cuál es cuál. Se detectó mirando
// el render real en F4, no con tests.
//
// NO hay checkbox de selección: sin acciones bulk sería un control decorativo — el mismo criterio
// por el que F4 no pintó la tab "Assets" vacía.
export function OrchestrationRow({
  flow,
  t,
  locale,
  busy,
  onRun,
  onRetry,
  onCancel,
  onEdit,
  onToggle,
  onDelete,
}: {
  flow: ProviderFlowDto;
  t: T;
  locale: Locale;
  busy: boolean;
  onRun: () => void;
  onRetry: () => void;
  onCancel: () => void;
  /** Omitido = sin ítem "Editar" (ver `OrchestrationActionsMenu`). */
  onEdit?: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { policy, last_run_metrics: metrics } = flow;
  // Deep-link corrida→cola (F4 #4.7): solo enlaza si hay corrida Y quedó algo pendiente.
  const queueHref = runQueueHref(flow);

  return (
    <TableRow className={`border-border/60 ${policy.enabled ? "" : "opacity-60"}`}>
      <TableCell>
        <FlowStatusBadge state={flow.last_run_state} t={t} />
      </TableCell>

      {/* Proveedor: logo en caja uniforme (los logos anchos como Bravo se acotan igual que los
          cuadrados) + nombre. Cae al `provider_id` si el proveedor no resolvió. */}
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-12 shrink-0 items-center">
            <ProviderLogo
              name={flow.provider_name ?? ""}
              logoUrl={flow.provider_logo_url}
              className="max-h-8 max-w-12 object-contain"
            />
          </div>
          <span className="truncate font-medium text-foreground">
            {flow.provider_name ?? policy.provider_id ?? "—"}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-foreground">{policy.flow_key ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            {t(`admin.orchestration.mode.${policy.execution_mode}` as MessageKey)}
          </span>
        </div>
      </TableCell>

      {/* Horario: el cron SOLO significa algo en modo `cron`. En `manual` o `automatic_chain` el
          reloj no dispara este flujo, y mostrar una expresión ahí sería prometer lo que no pasa. */}
      <TableCell>
        {policy.execution_mode === "cron" && policy.cron_expression ? (
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-xs text-foreground">{policy.cron_expression}</span>
            <span className="text-xs text-muted-foreground">{policy.timezone}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t("admin.orchestration.schedule.none")}</span>
        )}
      </TableCell>

      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {/* `—` y no una fecha inventada: en manual o cadena declarativa el reloj no dispara. */}
        {policy.next_run_at ? new Date(policy.next_run_at).toLocaleString(locale) : "—"}
      </TableCell>

      {/* Productos: la señal que YA viajaba en `RunMetricsDto` desde F4 y la tabla tiraba. */}
      <TableCell data-testid="orchestration-products">
        {metrics ? (
          <div className="flex flex-col leading-tight">
            <span className="text-sm tabular-nums text-foreground">
              {format(locale, "admin.orchestration.products.seen", { seen: String(metrics.seen) })}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {format(locale, "admin.orchestration.products.breakdown", {
                refreshed: String(metrics.refreshed),
                matched: String(metrics.matched),
                discarded: String(metrics.discarded),
              })}
            </span>
            {/* §14 #14. Solo se pinta si hay PLAN contra el que medir (`query_progress != null`):
                una barra al 0% sobre una corrida sin plan afirmaría "no avanzó", que es distinto de
                "no sabemos". Las corridas viejas —anteriores al contador— caen justo ahí. */}
            {metrics.query_progress != null ? (
              <span
                data-testid="orchestration-query-progress"
                title={t("admin.orchestration.products.queryProgressTitle")}
                className="mt-1 flex items-center gap-1.5"
              >
                <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-brand-lime"
                    style={{ width: `${Math.round(metrics.query_progress * 100)}%` }}
                  />
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {format(locale, "admin.orchestration.products.queryProgress", {
                    processed: String(metrics.queries_processed),
                    total: String(metrics.queries_total),
                  })}
                </span>
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-xs tabular-nums">
        {metrics ? (
          <span>
            {format(locale, "admin.orchestration.outcome.linkedPart", {
              autoLinked: String(metrics.auto_linked),
            })}
            {" · "}
            {/* Solo el número "a la cola" es clicable, y solo si hay algo que revisar. */}
            {queueHref ? (
              <a
                href={queueHref}
                title={t("admin.orchestration.outcome.queuedLinkTitle")}
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                {format(locale, "admin.orchestration.outcome.queuedPart", {
                  queued: String(metrics.queued_for_review),
                })}
              </a>
            ) : (
              format(locale, "admin.orchestration.outcome.queuedPart", {
                queued: String(metrics.queued_for_review),
              })
            )}
            {" · "}
            {format(locale, "admin.orchestration.outcome.newPart", {
              canonicals: String(metrics.new_canonicals),
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <OrchestrationActionsMenu
          flow={flow}
          t={t}
          busy={busy}
          onRun={onRun}
          onRetry={onRetry}
          onCancel={onCancel}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  );
}

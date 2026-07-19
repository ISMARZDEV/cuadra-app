import type { ProviderFlowDto } from "@cuadra/api-client";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { useAdminList } from "@/features/admin/shell/use-admin-list";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { cancelRun, listProviderFlowEntries, pausePolicy, resumePolicy, runPolicy } from "../api";
import type { OrchestrationData } from "../interfaces";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { OrchestrationKpis } from "./OrchestrationKpis";

type T = (key: MessageKey) => string;

// Consola de Orquestación (F4 #4.6). Opera el Descubrimiento sin salir del admin.
//
// v1 trae SOLO la tab Proveedores. La tab "Assets Dagster" que pide el spec necesita un endpoint de
// assets que todavía no existe: pintarla vacía o con datos de ejemplo sería una pestaña que miente.
// Cuando exista el endpoint, entra acá como segunda tab.
export function OrchestrationScreen() {
  const { flows: initialFlows, runnerDisconnected, locale = DEFAULT_LOCALE } = useData<
    OrchestrationData & { locale?: Locale }
  >();
  const { t } = useAdminI18n(locale);
  const { items: flows, refresh } = useAdminList(initialFlows, listProviderFlowEntries);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.orchestration.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("admin.orchestration.subtitle")}</p>
      </header>

      {runnerDisconnected && (
        // Estado DEGRADADO explícito, no un error. La política sigue siendo visible y editable
        // porque vive en nuestra DB — es justo cuando el operador más necesita mirarla.
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {t("admin.orchestration.runnerDown")}
        </div>
      )}

      <OrchestrationKpis flows={flows} degraded={runnerDisconnected} t={t} />

      {flows.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          {t("admin.orchestration.empty")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.orchestration.col.provider")}</TableHead>
              <TableHead>{t("admin.orchestration.col.flow")}</TableHead>
              <TableHead>{t("admin.orchestration.col.mode")}</TableHead>
              <TableHead>{t("admin.orchestration.col.nextRun")}</TableHead>
              <TableHead>{t("admin.orchestration.col.lastRun")}</TableHead>
              <TableHead className="text-right">{t("admin.orchestration.col.outcome")}</TableHead>
              <TableHead className="text-right">{t("admin.orchestration.col.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.map((flow) => (
              <FlowRow
                key={flow.policy.policy_id}
                flow={flow}
                t={t}
                locale={locale}
                busy={busyId === flow.policy.policy_id}
                onRun={() => act(flow.policy.policy_id, () => runPolicy(flow.policy.policy_id))}
                onToggle={() =>
                  act(flow.policy.policy_id, () =>
                    flow.policy.enabled
                      ? pausePolicy(flow.policy.policy_id)
                      : resumePolicy(flow.policy.policy_id),
                  )
                }
                onCancel={
                  flow.last_run_id && isCancellable(flow.last_run_state)
                    ? () => act(flow.policy.policy_id, () => cancelRun(flow.last_run_id!))
                    : undefined
                }
              />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

// Espeja las afordancias del DOMINIO (`RunState.is_cancellable`): solo lo que está en vuelo. Ofrecer
// "Cancelar" sobre algo que ya se está cancelando es un botón que no hace nada, y eso erosiona la
// confianza en la consola entera.
function isCancellable(state: string | null | undefined): boolean {
  return state === "queued" || state === "running";
}

function FlowRow({
  flow,
  t,
  locale,
  busy,
  onRun,
  onToggle,
  onCancel,
}: {
  flow: ProviderFlowDto;
  t: T;
  locale: Locale;
  busy: boolean;
  onRun: () => void;
  onToggle: () => void;
  onCancel?: () => void;
}) {
  const { policy, last_run_metrics: metrics } = flow;
  return (
    <TableRow className={policy.enabled ? undefined : "opacity-60"}>
      {/* El PROVEEDOR es la identidad de la fila. Con el flow_key primero, tres filas de
          `provider_prices_refresh` se ven idénticas y el operador no sabe cuál es cuál. */}
      <TableCell className="font-medium">{flow.provider_name ?? policy.provider_id ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{policy.flow_key ?? "—"}</TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {t(`admin.orchestration.mode.${policy.execution_mode}` as MessageKey)}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {/* `—` y no una fecha inventada: en modo manual o cadena declarativa, el reloj no dispara. */}
        {policy.next_run_at ? new Date(policy.next_run_at).toLocaleString(locale) : "—"}
      </TableCell>
      <TableCell>
        <FlowStatusBadge state={flow.last_run_state} t={t} />
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {metrics ? (
          <span title={t("admin.orchestration.col.outcome")}>
            {format(locale, "admin.orchestration.outcome.summary", {
              autoLinked: String(metrics.auto_linked),
              queued: String(metrics.queued_for_review),
              canonicals: String(metrics.new_canonicals),
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="space-x-2 text-right">
        <Button size="sm" variant="outline" onClick={onRun} disabled={busy || !policy.enabled}>
          {t("admin.orchestration.action.run")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggle} disabled={busy}>
          {t(policy.enabled ? "admin.orchestration.action.pause" : "admin.orchestration.action.resume")}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("admin.orchestration.action.cancel")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

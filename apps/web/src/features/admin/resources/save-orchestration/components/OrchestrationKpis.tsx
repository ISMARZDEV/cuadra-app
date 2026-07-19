import type { ProviderFlowDto } from "@cuadra/api-client";

import type { MessageKey } from "@/i18n/messages";

// KPIs de la consola. TODOS salen de datos REALES que ya tenemos.
//
// El spec pedía otros cuatro (corridas exitosas hoy, fallidas hoy, proveedores dentro del SLA,
// queries ejecutadas vs límite) y NO se implementan como pedía: hoy no existe la señal. El
// histórico por día necesita un listado global de corridas que el bridge todavía no expone, el SLA
// necesita una definición de política que nadie cerró, y "queries ejecutadas" no es `seen` (uno
// cuenta búsquedas, el otro productos devueltos). Inventarlos habría llenado la pantalla de números
// plausibles y falsos — prohibido por el plan maestro §1.
//
// Los cuatro de abajo responden la pregunta operativa real de una corrida de Descubrimiento:
// ¿cuánto se enlazó solo, cuánto trabajo humano quedó, y cuánto catálogo nuevo salió de ahí?
interface Kpi {
  labelKey: MessageKey;
  value: string;
  hintKey: MessageKey;
}

function sum(flows: ProviderFlowDto[], pick: (f: ProviderFlowDto) => number | undefined): number {
  return flows.reduce((acc, f) => acc + (pick(f) ?? 0), 0);
}

export function buildKpis(flows: ProviderFlowDto[], degraded: boolean): Kpi[] {
  // Con el runner caído no hay métricas de corrida: se muestra `—`, no `0`. Un cero diría
  // "corrió y no encontró nada"; la verdad es "no pudimos preguntar".
  const metric = (pick: (f: ProviderFlowDto) => number | undefined) =>
    degraded ? "—" : String(sum(flows, pick));

  return [
    {
      labelKey: "admin.orchestration.kpi.activeFlows",
      value: `${flows.filter((f) => f.policy.enabled).length}/${flows.length}`,
      hintKey: "admin.orchestration.kpi.activeFlows.hint",
    },
    {
      labelKey: "admin.orchestration.kpi.autoLinked",
      value: metric((f) => f.last_run_metrics?.auto_linked),
      hintKey: "admin.orchestration.kpi.autoLinked.hint",
    },
    {
      labelKey: "admin.orchestration.kpi.queued",
      value: metric((f) => f.last_run_metrics?.queued_for_review),
      hintKey: "admin.orchestration.kpi.queued.hint",
    },
    {
      labelKey: "admin.orchestration.kpi.newCanonicals",
      value: metric((f) => f.last_run_metrics?.new_canonicals),
      hintKey: "admin.orchestration.kpi.newCanonicals.hint",
    },
  ];
}

export function OrchestrationKpis({
  flows,
  degraded,
  t,
}: {
  flows: ProviderFlowDto[];
  degraded: boolean;
  t: (key: MessageKey) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {buildKpis(flows, degraded).map((kpi) => (
        <div
          key={kpi.labelKey}
          className="border-border bg-card rounded-lg border p-4"
          title={t(kpi.hintKey)}
        >
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t(kpi.labelKey)}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t(kpi.hintKey)}</p>
        </div>
      ))}
    </div>
  );
}

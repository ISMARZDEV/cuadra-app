import type { ProviderFlowDto } from "@cuadra/api-client";

import { KpiCard } from "@/features/admin/resources/save-matching/components/kpi/KpiCard";
import { MiniBarChart } from "@/features/admin/resources/save-matching/components/kpi/charts/MiniBarChart";
import { RadialGauge } from "@/features/admin/resources/save-matching/components/kpi/charts/RadialGauge";
import {
  KpiSentiment,
  type SeriesPoint,
} from "@/features/admin/resources/save-matching/components/kpi/types";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

// KPIs de la consola. TODOS salen de datos REALES que ya tenemos — ninguno inventa una cifra.
//
// El spec pedía otros cuatro (corridas exitosas hoy, fallidas hoy, proveedores dentro del SLA,
// queries ejecutadas vs límite). El de SLA se implementó (regla cerrada 2026-07-19); los otros tres
// siguen sin señal: el histórico por día necesita un listado global de corridas que el bridge no
// expone, y "queries ejecutadas" no es `seen` (uno cuenta búsquedas, el otro productos devueltos).
//
// Por qué SÍ llevan mini-chart, si antes argumenté que no: lo que falta es la serie TEMPORAL, no los
// datos. La DISTRIBUCIÓN por proveedor (cuánto enlazó cada tienda, cuánto encoló) es real y está en
// la mano — graficarla no inventa nada. Lo único que no se dibuja es lo que no se pudo preguntar.

export interface KpiBadge {
  labelKey: MessageKey;
  count?: number;
  sentiment: KpiSentiment;
}

/** Forma del indicador. Se declara SIEMPRE (haya datos o no) para poder dibujar su esqueleto
 * cuando no los hay: un card sin cuerpo se ve roto, y además rompe la altura de la fila. */
export type KpiChart = "gaugeLegend" | "bars";

export interface OrchestrationKpi {
  labelKey: MessageKey;
  hintKey: MessageKey;
  value: string;
  /** El valor es una AUSENCIA (`—`), no una cifra. */
  placeholder: boolean;
  chart: KpiChart;
  badge?: KpiBadge;
  /** Arco 0..100 del `RadialGauge`. */
  gauge?: number;
  /** Leyenda del gauge, con conteos ABSOLUTOS (no porcentajes): el operador necesita el número. */
  legend?: { labelKey: MessageKey; count: number; colorClass: string }[];
  /** Una barra por proveedor. */
  bars?: SeriesPoint[];
}

const DASH = "—";

// Colores de los cuadritos de leyenda: el relleno del arco y su track. Una sola casa — se usan en
// los tres cards con gauge y tres copias se desincronizan al primer retoque.
const GREEN = "text-brand-green";
const GREY = "text-neutral-300 dark:text-neutral-600";

function sum(flows: ProviderFlowDto[], pick: (f: ProviderFlowDto) => number | undefined): number {
  return flows.reduce((acc, f) => acc + (pick(f) ?? 0), 0);
}

/** Una barra por flujo, etiquetada con el proveedor. Sin filas con dato → `undefined` (no se dibuja
 * un chart plano de ceros, que se leería como "corrió y no encontró nada"). */
function barsBy(
  flows: ProviderFlowDto[],
  pick: (f: ProviderFlowDto) => number | undefined,
): SeriesPoint[] | undefined {
  const points = flows
    .filter((f) => f.last_run_metrics)
    .map((f) => ({ label: f.provider_name ?? "—", value: pick(f) ?? 0 }));
  return points.length > 0 && points.some((p) => p.value > 0) ? points : undefined;
}

/**
 * `X/Y dentro del SLA` — regla cerrada por el usuario el 2026-07-19.
 *
 * El estado por flujo lo calcula el DOMINIO (`OrchestrationPolicy.sla_status`) y llega en el DTO;
 * acá SOLO se agrega. Duplicar la fórmula en el front la desincronizaría del detalle por proveedor.
 *
 * `not_applicable` (manual, o sin `sla_minutes`) queda **fuera del denominador**: contarlo haría que
 * la consola dijera "0/3 dentro de SLA" con todo sano. Denominador 0 → `—`, nunca `0/0`.
 */
function slaParts(flows: ProviderFlowDto[]) {
  const measurable = flows.filter((f) => f.sla_status && f.sla_status !== "not_applicable");
  const within = measurable.filter((f) => f.sla_status === "within").length;
  return { measurable: measurable.length, within };
}

export function buildKpis(flows: ProviderFlowDto[], degraded: boolean): OrchestrationKpi[] {
  const total = flows.length;
  const enabled = flows.filter((f) => f.policy.enabled).length;
  const paused = total - enabled;

  const autoLinked = sum(flows, (f) => f.last_run_metrics?.auto_linked);
  const queued = sum(flows, (f) => f.last_run_metrics?.queued_for_review);
  const decided = autoLinked + queued;
  const newCanonicals = sum(flows, (f) => f.last_run_metrics?.new_canonicals);

  const sla = slaParts(flows);
  const slaMeasurable = !degraded && sla.measurable > 0;
  // Con el runner caído no hay desenlace que medir: `—`, nunca `0%`. Un cero diría "no enlazó nada";
  // la verdad es "no pudimos preguntar".
  const hasOutcome = !degraded && decided > 0;

  return [
    {
      labelKey: "admin.orchestration.kpi.activeFlows",
      hintKey: "admin.orchestration.kpi.activeFlows.hint",
      chart: "gaugeLegend",
      // Sale de NUESTRA DB: se sabe con o sin runner. Degradarlo escondería información que sí hay.
      value: `${enabled}/${total}`,
      placeholder: false,
      badge:
        paused > 0
          ? { labelKey: "admin.orchestration.kpi.badge.paused", count: paused, sentiment: KpiSentiment.Neutral }
          : { labelKey: "admin.orchestration.kpi.badge.allActive", sentiment: KpiSentiment.Positive },
      gauge: total > 0 ? Math.round((enabled / total) * 100) : 0,
      legend: [
        { labelKey: "admin.orchestration.kpi.legend.active", count: enabled, colorClass: GREEN },
        { labelKey: "admin.orchestration.kpi.legend.paused", count: paused, colorClass: GREY },
      ],
    },
    {
      labelKey: "admin.orchestration.kpi.withinSla",
      hintKey: "admin.orchestration.kpi.withinSla.hint",
      chart: "gaugeLegend",
      value: slaMeasurable ? `${sla.within}/${sla.measurable}` : DASH,
      placeholder: !slaMeasurable,
      badge: !slaMeasurable
        ? undefined
        : sla.within === sla.measurable
          ? { labelKey: "admin.orchestration.kpi.badge.onTime", sentiment: KpiSentiment.Positive }
          : {
              labelKey: "admin.orchestration.kpi.badge.breached",
              count: sla.measurable - sla.within,
              sentiment: KpiSentiment.Negative,
            },
      gauge: slaMeasurable ? Math.round((sla.within / sla.measurable) * 100) : undefined,
      legend: slaMeasurable
        ? [
            { labelKey: "admin.orchestration.kpi.legend.onTime", count: sla.within, colorClass: GREEN },
            {
              labelKey: "admin.orchestration.kpi.legend.late",
              count: sla.measurable - sla.within,
              colorClass: GREY,
            },
          ]
        : undefined,
    },
    {
      // Espeja el card "Auto-link Rate" de la Cola de revisión: el RATIO manda, y la leyenda
      // conserva los dos números absolutos para que no se pierda "cuántos quedaron a la cola".
      labelKey: "admin.orchestration.kpi.autoLinkRate",
      hintKey: "admin.orchestration.kpi.autoLinkRate.hint",
      chart: "gaugeLegend",
      value: hasOutcome ? `${Math.round((autoLinked / decided) * 100)}%` : DASH,
      placeholder: !hasOutcome,
      badge: hasOutcome
        ? {
            labelKey: "admin.orchestration.kpi.badge.queued",
            count: queued,
            sentiment: queued > 0 ? KpiSentiment.Neutral : KpiSentiment.Positive,
          }
        : undefined,
      gauge: hasOutcome ? Math.round((autoLinked / decided) * 100) : undefined,
      legend: hasOutcome
        ? [
            {
              labelKey: "admin.orchestration.kpi.legend.autoLinked",
              count: autoLinked,
              colorClass: GREEN,
            },
            {
              labelKey: "admin.orchestration.kpi.legend.queued",
              count: queued,
              colorClass: GREY,
            },
          ]
        : undefined,
    },
    {
      labelKey: "admin.orchestration.kpi.newCanonicals",
      hintKey: "admin.orchestration.kpi.newCanonicals.hint",
      chart: "bars",
      value: degraded ? DASH : String(newCanonicals),
      placeholder: degraded,
      badge: degraded
        ? undefined
        : {
            labelKey: "admin.orchestration.kpi.badge.fromQueued",
            count: queued,
            sentiment: KpiSentiment.Neutral,
          },
      bars: degraded ? undefined : barsBy(flows, (f) => f.last_run_metrics?.new_canonicals),
    },
  ];
}

/**
 * Esqueleto INERTE del indicador, para cuando no hay dato que dibujar.
 *
 * Da la forma del card (y mantiene la altura de la fila pareja) sin AFIRMAR un valor. Deliberadamente
 * NO usa el `Skeleton` del repo: ese tiene `animate-pulse`, que promete "esperá, está cargando" —
 * y acá el dato no está cargando, **no está disponible** (el runner no respondió). Un esqueleto que
 * late sería la misma mentira en verde que venimos evitando, con otra cara.
 *
 * Tampoco se dibuja un gauge al 0% "de verdad": el arco de valor queda vacío y todo va apagado, para
 * que se lea como ausencia y no como un cero.
 */
function ChartSkeleton({ kind }: { kind: KpiChart }) {
  if (kind === "bars") {
    return (
      <div className="flex h-[88px] items-end justify-center gap-5 opacity-30" aria-hidden="true">
        {[0.45, 0.7, 0.3].map((f, i) => (
          <div key={i} className="w-5 shrink-0 rounded-[4px] bg-muted-foreground/40" style={{ height: `${f * 88}px` }} />
        ))}
      </div>
    );
  }
  // Arco vacío + hueco de la leyenda: reservar los DOS lados evita que el card salte de alto y de
  // ancho cuando lleguen los datos.
  return (
    <div className="flex items-center justify-center gap-4 opacity-30" aria-hidden="true">
      <RadialGauge pct={0} height={94} />
      <ul className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block size-4 rounded-[5px] bg-muted-foreground/40" />
            <span className="block h-3 w-20 rounded bg-muted-foreground/25" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrchestrationKpis({
  flows,
  degraded,
  t,
  locale,
}: {
  flows: ProviderFlowDto[];
  degraded: boolean;
  t: (key: MessageKey) => string;
  locale: Locale;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {buildKpis(flows, degraded).map((kpi) => (
        <KpiCard
          key={kpi.labelKey}
          title={t(kpi.labelKey)}
          value={kpi.value}
          placeholder={kpi.placeholder}
          badge={
            kpi.badge
              ? {
                  label:
                    kpi.badge.count === undefined
                      ? t(kpi.badge.labelKey)
                      : format(locale, kpi.badge.labelKey, { count: String(kpi.badge.count) }),
                  sentiment: kpi.badge.sentiment,
                }
              : undefined
          }
          subtitle={t(kpi.hintKey)}
          menuLabel={t(kpi.labelKey)}
        >
          {kpi.legend ? (
            <div className="flex items-center justify-center gap-4">
              {/* Etiqueta dentro del arco SOLO si el titular no es ya el porcentaje: en "Flujos
                  activos" el titular es un ratio (`3/3`) y el `100%` aporta; en "Tasa de
                  auto-enlace" sería repetir el mismo número dos veces. */}
              <RadialGauge
                pct={kpi.gauge ?? 0}
                centerLabel={kpi.value.endsWith("%") ? undefined : `${kpi.gauge ?? 0}%`}
                height={94}
              />
              <ul className="flex flex-col gap-3 text-[13px]">
                {kpi.legend.map((seg) => (
                  <li key={seg.labelKey} className="flex items-center gap-2">
                    <span
                      className={`inline-block size-4 rounded-[5px] bg-current ${seg.colorClass}`}
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">{seg.count}</span>{" "}
                      {t(seg.labelKey)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : kpi.bars ? (
            <MiniBarChart data={kpi.bars} height={88} className="w-full" />
          ) : (
            <ChartSkeleton kind={kpi.chart} />
          )}
        </KpiCard>
      ))}
    </div>
  );
}

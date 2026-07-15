import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";

import {
  AUTO_LINK_KPI,
  KPI_DATA_IS_DEMO,
  KpiSentiment,
  METHOD_MIX_KPI,
  PENDING_QUEUE_KPI,
  QUEUE_TIME_KPI,
} from "../../lib/review-queue-kpis";
import { KpiCard } from "./KpiCard";
import { MethodShareChart } from "./charts/MethodShareChart";
import { MiniBarChart } from "./charts/MiniBarChart";
import { MiniLineChart } from "./charts/MiniLineChart";
import { RadialGauge } from "./charts/RadialGauge";

interface ReviewQueueKpisProps {
  locale?: Locale;
}

// Fila de los 4 KPI cards de la cola de revisión (Figma 549:10191). Wirea los fixtures DEMO
// (`review-queue-kpis.ts`) a los `KpiCard` + su chart. Cuando exista `GetMatchingMetrics` (Fase 4)
// se reemplazan los fixtures por el DTO real acá — los componentes no cambian. Tamaños idénticos en
// ambos temas.
export function ReviewQueueKpis({ locale = DEFAULT_LOCALE }: ReviewQueueKpisProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const demoLabel = t("admin.reviewQueue.kpi.demo");
  const menuLabel = t("admin.reviewQueue.kpi.menu");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Card 1 — Cola Pendiente */}
      <KpiCard
        title={t("admin.reviewQueue.kpi.pending.title")}
        value={PENDING_QUEUE_KPI.value}
        badge={{
          label: `${PENDING_QUEUE_KPI.delta.label} ${t("admin.reviewQueue.kpi.pending.unit")}`,
          sentiment: PENDING_QUEUE_KPI.delta.sentiment,
        }}
        subtitle={t("admin.reviewQueue.kpi.pending.subtitle")}
        demo={KPI_DATA_IS_DEMO}
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MiniBarChart data={[...PENDING_QUEUE_KPI.bars]} height={88} className="w-full" />
      </KpiCard>

      {/* Card 2 — Auto-link Rate (gauge + leyenda) */}
      <KpiCard
        title={t("admin.reviewQueue.kpi.autoLink.title")}
        value={AUTO_LINK_KPI.value}
        badge={{ label: AUTO_LINK_KPI.delta.label, sentiment: AUTO_LINK_KPI.delta.sentiment }}
        subtitle={t("admin.reviewQueue.kpi.autoLink.subtitle")}
        demo={KPI_DATA_IS_DEMO}
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <div className="flex items-center justify-center gap-4">
          <RadialGauge pct={AUTO_LINK_KPI.segments[0]!.pct} centerLabel={AUTO_LINK_KPI.period} height={94} />
          <ul className="flex flex-col gap-3 text-[13px]">
            {AUTO_LINK_KPI.segments.map((seg) => (
              <li key={seg.labelKey} className="flex items-center gap-2">
                <span className={`inline-block size-4 rounded-[5px] bg-current ${seg.colorClass}`} aria-hidden="true" />
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{seg.pct}%</span> {t(seg.labelKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </KpiCard>

      {/* Card 3 — Métodos de Match */}
      <KpiCard
        title={t("admin.reviewQueue.kpi.methods.title")}
        value={String(METHOD_MIX_KPI.activeChannels)}
        badge={{ label: t("admin.reviewQueue.kpi.methods.channels"), sentiment: KpiSentiment.Positive }}
        subtitle={t("admin.reviewQueue.kpi.methods.subtitle")}
        demo={KPI_DATA_IS_DEMO}
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MethodShareChart shares={[...METHOD_MIX_KPI.shares]} />
      </KpiCard>

      {/* Card 4 — Tiempo en Cola */}
      <KpiCard
        title={t("admin.reviewQueue.kpi.queueTime.title")}
        value={QUEUE_TIME_KPI.value}
        badge={{
          label: `${QUEUE_TIME_KPI.delta.label} ${t("admin.reviewQueue.kpi.queueTime.unit")}`,
          sentiment: QUEUE_TIME_KPI.delta.sentiment,
        }}
        subtitle={t("admin.reviewQueue.kpi.queueTime.subtitle")}
        demo={KPI_DATA_IS_DEMO}
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MiniLineChart data={[...QUEUE_TIME_KPI.line]} highlight={QUEUE_TIME_KPI.highlight} height={88} className="w-full" />
      </KpiCard>
    </div>
  );
}

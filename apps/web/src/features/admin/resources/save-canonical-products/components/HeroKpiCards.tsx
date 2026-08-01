import { KpiCard } from "@/features/admin/resources/save-matching/components/kpi/KpiCard";
import { MiniBarChart } from "@/features/admin/resources/save-matching/components/kpi/charts/MiniBarChart";
import { MiniLineChart } from "@/features/admin/resources/save-matching/components/kpi/charts/MiniLineChart";
import { RadialGauge } from "@/features/admin/resources/save-matching/components/kpi/charts/RadialGauge";
import {
  KpiSentiment,
  type SeriesPoint,
} from "@/features/admin/resources/save-matching/components/kpi/types";
import type { MessageKey } from "@/i18n/messages";

/**
 * Los cuatro indicadores de audiencia del hero.
 *
 * TODOS son de DEMOSTRACIÓN, y por eso van con `demo` — el chip honesto que ya trae `KpiCard`.
 * Save no captura analítica de producto: no hay visitas, ni búsquedas, ni usuarios alcanzados, ni
 * ranking de popularidad en ninguna tabla. Se maquetan porque el diseño los pide y porque fijan el
 * espacio que van a ocupar cuando existan.
 *
 * Se arman con el `KpiCard` de la Cola de revisión y sus charts, que es lo que ya usa la consola
 * de Orquestación. Un card propio acá haría que el detalle canónico se viera "de otra app" —
 * exactamente el problema que dejó escrito el inventario de UI compartida.
 */
export function HeroKpiCards({ t }: { t: (key: MessageKey) => string }) {
  const demoLabel = t("admin.canonicalDetail.hero.demoData");
  const menuLabel = t("admin.canonicalDetail.hero.demoData");

  const visits: SeriesPoint[] = [
    { label: "S1", value: 180 },
    { label: "S2", value: 245 },
    { label: "S3", value: 210 },
    { label: "S4", value: 310 },
    { label: "S5", value: 280 },
    { label: "S6", value: 350 },
    { label: "S7", value: 320 },
    { label: "S8", value: 410 },
  ];
  const reach: SeriesPoint[] = [
    { label: "Bravo", value: 6800 },
    { label: "Sirena", value: 4500 },
    { label: "Nacional", value: 2200 },
  ];
  const popularity: SeriesPoint[] = [
    { label: "1", value: 62 },
    { label: "2", value: 58 },
    { label: "3", value: 64 },
    { label: "4", value: 71 },
    { label: "5", value: 68 },
    { label: "6", value: 78 },
    { label: "7", value: 74 },
    { label: "8", value: 69 },
  ];

  return (
    <div className="grid w-full min-w-0 grid-cols-2 grid-rows-2 gap-3">
      <KpiCard
        compact
        title={t("admin.canonicalDetail.kpi.visits")}
        value="12.4k"
        badge={{ label: "+18%", sentiment: KpiSentiment.Positive }}
        subtitle={t("admin.canonicalDetail.kpi.visitsHint")}
        demo
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MiniBarChart data={visits} height={36} />
      </KpiCard>

      <KpiCard
        compact
        title={t("admin.canonicalDetail.kpi.searches")}
        value="847"
        badge={{ label: "+5pp", sentiment: KpiSentiment.Positive }}
        subtitle={t("admin.canonicalDetail.kpi.searchesHint")}
        demo
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <div className="flex items-center justify-center gap-2">
          <RadialGauge pct={68} centerLabel="68%" height={40} />
          <ul className="space-y-0.5 text-[10px] whitespace-nowrap text-muted-foreground">
            <li>847 enlazados</li>
            <li>30% auto</li>
          </ul>
        </div>
      </KpiCard>

      <KpiCard
        compact
        title={t("admin.canonicalDetail.kpi.reach")}
        value="15.2k"
        badge={{
          label: t("admin.canonicalDetail.kpi.reachHint"),
          sentiment: KpiSentiment.Neutral,
        }}
        subtitle="3 tiendas · 5 placements"
        demo
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MiniBarChart data={reach} height={36} />
      </KpiCard>

      <KpiCard
        compact
        title={t("admin.canonicalDetail.kpi.popularity")}
        value="78/100"
        badge={{
          label: t("admin.canonicalDetail.kpi.popularityHint"),
          sentiment: KpiSentiment.Neutral,
        }}
        subtitle="Top 12 en Lácteos"
        demo
        demoLabel={demoLabel}
        menuLabel={menuLabel}
      >
        <MiniLineChart data={popularity} highlight={{ index: 5, label: "+12%" }} height={36} />
      </KpiCard>
    </div>
  );
}

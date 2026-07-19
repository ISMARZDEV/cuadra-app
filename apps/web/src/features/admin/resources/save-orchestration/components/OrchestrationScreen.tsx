import { useData } from "vike-react/useData";

import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

// Consola de Orquestación (Save) — F4.
//
// 4.1 entrega SOLO el acceso: capability propia (`admin_save_orchestration_ops`), registro en el
// nav y la ruta SSR gateada. La pantalla real (KPIs + tabs Proveedores/Assets Dagster) se construye
// en 4.6, sobre los endpoints de 4.5.
//
// Deliberadamente NO se pintan KPIs ni tablas de mentira: la doctrina de Save prohíbe inventar
// datos para llenar una UI (plan maestro §1). Hasta que exista la señal real, esto declara
// honestamente que el módulo está en construcción.
export function OrchestrationScreen() {
  const { locale = DEFAULT_LOCALE } = useData<{ locale?: Locale }>();
  const { t } = useAdminI18n(locale);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.orchestration.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("admin.orchestration.subtitle")}</p>
      </header>

      <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        {t("admin.orchestration.pending")}
      </div>
    </section>
  );
}

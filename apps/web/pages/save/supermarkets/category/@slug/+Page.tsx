import { usePageContext } from "vike-react/usePageContext";

import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";

// Listado por categoría con filtros (Imagen #8): sidebar (precio/tiendas/marcas) + grid + orden.
// Estructura; el listado real por categoría (endpoint + filtros) se cablea después.
export default function Page() {
  const pageContext = usePageContext();
  const { t } = usePageI18n();
  const slug = pageContext.routeParams.slug ?? "";
  const title = slug.replace(/-/g, " ");

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[220px_1fr]">
      <aside className="space-y-6 text-sm">
        <h2 className="font-semibold">{t("category.filters")}</h2>
        <div>
          <p className="mb-2 font-medium">{t("compare.price")}</p>
          <div className="h-2 rounded-full bg-secondary" />
        </div>
        <div>
          <p className="mb-2 font-medium">{t("compare.store")}</p>
          {["Merca Jumbo", "Nacional", "Sirena", "Bravo"].map((s) => (
            <label key={s} className="flex items-center gap-2 py-1 text-muted-foreground">
              <input type="checkbox" /> {s}
            </label>
          ))}
        </div>
      </aside>
      <div>
        <h1 className="text-2xl font-bold capitalize">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">0 {t("category.products")}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-52 border-dashed bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}

// RUTA DE PREVIEW TEMPORAL (no-admin, sin gate de Clerk) — solo para auto-verificación visual del
// workspace de la cola de revisión (KPIs + toolbar + tabla) en claro Y oscuro, sin depender de un
// screenshot autenticado ni del backend. BORRAR antes de commitear.
import type { AdminReviewQueueRowDto } from "@cuadra/api-client";
import { useState } from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui-base/table";
import { AdminLayout } from "@/features/admin/shell/AdminLayout";
import { AdminTopBar } from "@/features/admin/shell/AdminTopBar";
import { ReviewQueueKpis } from "@/features/admin/resources/save-matching/components/kpi/ReviewQueueKpis";
import { ReviewQueueToolbar } from "@/features/admin/resources/save-matching/components/ReviewQueueToolbar";
import { ReviewRow } from "@/features/admin/resources/save-matching/components/ReviewRow";
import { providerLogoByName } from "@/features/save/lib/provider-logos";
import type { ReviewQueueParams } from "@/features/admin/resources/save-matching/types";

let n = 0;
const MOCK_ROWS: AdminReviewQueueRowDto[] = [
  mock("Arroz Goya Valencia 24 Oz", "GOYA", "24 Oz", 0.85, "llm", { slug: "despensa-abarrotes", name: "Despensa & Abarrotes" }),
  mock("Carne Premium Angus de Res", "N/A", "2.0 Kg", 0.94, "human", { slug: "despensa-abarrotes", name: "Despensa & Abarrotes" }),
  mock("Cebolla Roja Criolla", "N/A", "115.2 Gr", 0.55, "hybrid", { slug: "frutas-verduras", name: "Frutas & Verduras" }),
  mock("Zanahoria", "N/A", "115.2 Lb", 0.26, "vector", { slug: "frutas-verduras", name: "Frutas & Verduras" }, null),
];

function mock(
  name: string,
  brand: string,
  size: string,
  confidence: number,
  method: string,
  category: { slug: string; name: string },
  image: string | null = "https://placehold.co/80x80/e5e7eb/065f46?text=P",
): AdminReviewQueueRowDto {
  n += 1;
  return {
    match_id: `m${n}`,
    store_product_id: `sp${n}`,
    confidence,
    method,
    provider_id: "p1",
    provider_name: "Sirena",
    provider_logo_url: null,
    store_product_name: name,
    store_product_brand: brand,
    store_product_size_text: size,
    store_product_image_url: image,
    category,
    candidate_count: 5,
    created_at: "2026-03-02T22:00:00Z",
  };
}

const PARAMS: ReviewQueueParams = { market: "DO", order_by: "uncertainty", limit: 50, offset: 0 };

function Workspace({ locale, bare }: { locale: "es"; bare?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["m2"]));
  return (
    <>
    {bare ? null : <AdminTopBar name="Ismael Porfirio Martínez Encarnación" locale={locale} />}
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">Cola de revisión</h1>
        <span className="text-base font-semibold text-brand-forest dark:text-brand-lime">(118)</span>
        <button type="button" className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-brand-forest px-4 text-sm font-semibold text-white shadow-sm">
          Sincronizar
        </button>
      </div>

      <ReviewQueueKpis locale={locale} />

      <ReviewQueueToolbar
        params={PARAMS}
        onParamsChange={() => {}}
        providers={["Bravo", "Sirena", "Nacional", "Carrefour", "Jumbo", "Plaza Lama"].map(
          (name, i) => {
            const logo = providerLogoByName(name);
            return {
              value: String(i),
              label: name,
              icon: logo ? (
                <img src={logo} alt="" className="max-h-5 max-w-8 object-contain" />
              ) : undefined,
            };
          },
        )}
        search=""
        onSearchChange={() => {}}
        view="list"
        onViewChange={() => {}}
        selectedCount={selected.size}
        onBulkApprove={() => {}}
        onBulkReject={() => {}}
        locale={locale}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-none hover:bg-transparent [&>th]:h-11 [&>th]:bg-[#ecf4f9] [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-[#464646] [&>th]:first:rounded-l-[10px] [&>th]:last:rounded-r-[10px] dark:[&>th]:bg-secondary dark:[&>th]:text-muted-foreground">
              <TableHead />
              <TableHead>Confianza</TableHead>
              <TableHead>Imagen</TableHead>
              <TableHead>Producto ▾</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Peso ▾</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Categoría ▾</TableHead>
              <TableHead>Marca ▾</TableHead>
              <TableHead>Tienda ▾</TableHead>
              <TableHead>Método ▾</TableHead>
              <TableHead>Fecha del match ⇅</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_ROWS.map((r) => (
              <ReviewRow
                key={r.match_id}
                row={r}
                href="#"
                locale={locale}
                selected={selected.has(r.match_id)}
                onToggleSelect={(id) => setSelected((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]))}
                onDelete={() => {}}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
    </>
  );
}

export default function UiPreview() {
  return (
    <div className="min-h-screen">
      {/* SHELL real (sidebar + inset) para probar el scroll horizontal de la tabla. */}
      <AdminLayout
        capabilities={["admin_save_matching_review", "admin_save_ingestion_ops"]}
        locale="es"
        name="Ismael Porfirio Martínez Encarnación"
      >
        <Workspace locale="es" bare />
      </AdminLayout>
    </div>
  );
}

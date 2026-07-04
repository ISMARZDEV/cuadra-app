import { Card } from "@/components/ui/card";

// Carrusel de sección con placeholders (esqueleto). Los datos reales (ofertas/populares) se
// cablean después — hoy define la ESTRUCTURA de la home de Supermercados (Imagen #4).
export function SectionRail({ title, seeAll }: { title: string; seeAll?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {seeAll && <span className="text-sm font-medium text-primary">{seeAll}</span>}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-44 w-40 shrink-0 border-dashed bg-muted/30" />
        ))}
      </div>
    </section>
  );
}

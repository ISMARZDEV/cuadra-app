import { usePageI18n } from "@/i18n/usePageI18n";

// Página placeholder para secciones aún no construidas (Financieros/Inversiones/Seguros/News/…).
// Mantiene la ruta viva con el shell + título; el contenido llega en su fase.
export function PlaceholderPage({ title }: { title: string }) {
  const { t } = usePageI18n();
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{t("common.comingSoon")}</p>
    </div>
  );
}

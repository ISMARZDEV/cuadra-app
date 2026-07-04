import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

// Landing corporativo de Cuadra (Imagen #3): hero "The Future is AI" + caja de chat IA +
// "Why Cuadra" con los 4 pilares (Insights/News/Save/AISpace). Estructura; datos/UI se pulen luego.
const PILLARS = ["Insights", "News", "Save", "AISpace"];

export default function Page() {
  const { locale, country, t } = usePageI18n();
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h1 className="bg-gradient-to-b from-primary to-foreground bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
          {t("corp.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("corp.subtitle")}</p>

        <Card className="mx-auto mt-10 max-w-2xl p-4 text-left">
          <textarea
            className="h-28 w-full resize-none bg-transparent text-sm outline-none"
            placeholder={t("corp.askPlaceholder")}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Powered by AISpace AI</span>
            <Button size="sm">
              {t("corp.ask")} <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="font-semibold text-lime">{t("corp.whyTag")}</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{t("corp.whyTitle")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("corp.whySubtitle")}</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PILLARS.map((p) => (
            <a
              key={p}
              href={p === "Save" ? localeHref(locale, country, "/save/supermarkets") : "#"}
            >
              <Card className="bg-secondary p-4 font-semibold text-secondary-foreground">{p}</Card>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

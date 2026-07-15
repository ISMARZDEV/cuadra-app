import { COUNTRY_NAMES } from "@/i18n/config";
import { usePageI18n } from "@/i18n/usePageI18n";

export function SiteFooter() {
  const { locale, country, t } = usePageI18n();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground">
        <span className="font-extrabold text-foreground">
          <span className="text-primary">CUA</span>DRA
        </span>
        <span> · {t("footer.tagline")} · {COUNTRY_NAMES[locale][country]}</span>
      </div>
    </footer>
  );
}

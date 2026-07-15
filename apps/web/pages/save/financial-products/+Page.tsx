import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { usePageI18n } from "@/i18n/usePageI18n";

export default function Page() {
  const { t } = usePageI18n();
  return <PlaceholderPage title={t("nav.financial")} />;
}

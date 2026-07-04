import type { AlertDto, AlertNotificationDto } from "@cuadra/api-client";
import { Bell, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format } from "@/i18n/messages";
import { usePageI18n } from "@/i18n/usePageI18n";
import { myAlerts, myNotifications, removeAlert } from "@/lib/alerts-api";
import { formatMoney } from "@/lib/format";
import { localeHref } from "@/lib/links";
import { useAuth } from "@/lib/use-auth";

// Mis alertas (G4): suscripciones (dejar de seguir) + feed de notificaciones disparadas. Estado
// cliente autenticado; el MISMO feed lo lee la app móvil (alertas compartidas por user_id).
export default function Page() {
  const { locale, country, t } = usePageI18n();
  const { isAuthed } = useAuth();
  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [notifs, setNotifs] = useState<AlertNotificationDto[]>([]);

  const refresh = useCallback(async () => {
    if (!isAuthed) return;
    const [a, n] = await Promise.all([myAlerts(), myNotifications()]);
    setAlerts(a.data ?? []);
    setNotifs(n.data ?? []);
  }, [isAuthed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{t("alerts.loginToWatch")}</p>
        <Button asChild size="sm" className="mt-4">
          <a href={localeHref(locale, country, "/save/supermarkets/login")}>{t("nav.login")}</a>
        </Button>
      </div>
    );
  }

  const onRemove = async (id: string) => {
    await removeAlert(id);
    void refresh();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t("alerts.title")}</h1>

      {/* Notificaciones disparadas */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-4" /> {t("alerts.notifications")}
        </h2>
        {notifs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("alerts.noNotifications")}</p>
        ) : (
          <ul className="space-y-2">
            {notifs.map((n) => (
              <li key={n.id}>
                <Card className="p-3">
                  <p className="text-sm font-medium">{n.product_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(locale, "alerts.droppedFromTo", {
                      from: formatMoney(n.previous_minor, n.currency),
                      to: formatMoney(n.current_minor, n.currency),
                      store: n.provider_name,
                    })}{" "}
                    <span className="font-medium text-primary">−{(n.drop_bps / 100).toFixed(1)}%</span>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suscripciones */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">{t("alerts.subscriptions")}</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("alerts.noAlerts")}</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id}>
                <Card className="flex items-center gap-3 p-3">
                  <a
                    href={localeHref(locale, country, `/save/supermarkets/product/${a.canonical_product_id}`)}
                    className="min-w-0 flex-1 text-sm font-medium hover:underline"
                  >
                    {a.product_name}
                  </a>
                  {a.threshold_minor != null && (
                    <span className="text-xs text-muted-foreground">
                      ≤ {formatMoney(a.threshold_minor, "DOP")}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t("alerts.unsubscribe")}
                    onClick={() => onRemove(a.id)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

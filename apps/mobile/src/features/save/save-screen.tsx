import { Bell } from "lucide-react-native";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { t, useLang } from "@/i18n";
import { palette } from "@/theme";

import { useAlertNotifications, useMyAlerts, useUnsubscribeAlert } from "./api";
import { NotificationCard } from "./components/notification-card";
import { SubscriptionRow } from "./components/subscription-row";

// Save (móvil) — por ahora, la CAMPANA de la app: el feed de alertas de precio G4 (mismo feed que
// la web, compartido por user_id) + los productos que sigues. La suscripción se hace desde la web
// (cuadra.do); acá se reciben y gestionan. El marketplace completo de Save llega después.
export function SaveScreen() {
  useLang(); // re-render en vivo al cambiar idioma
  const notifications = useAlertNotifications();
  const alerts = useMyAlerts();
  const unsubscribe = useUnsubscribeAlert();

  const refreshing = notifications.isRefetching || alerts.isRefetching;
  const onRefresh = () => {
    void notifications.refetch();
    void alerts.refetch();
  };

  const notifs = notifications.data ?? [];
  const subs = alerts.data ?? [];

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <ScrollView
        contentContainerClassName="px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <Text className="mb-1 text-2xl font-bold text-text">{t("save.alerts.title")}</Text>
        <Text className="mb-5 text-sm text-muted">{t("save.alerts.hint")}</Text>

        {/* Notificaciones disparadas */}
        <View className="mb-2 flex-row items-center gap-2">
          <Icon as={Bell} size={18} color={palette.primary} />
          <Text className="text-lg font-semibold text-text">{t("save.alerts.notifications")}</Text>
        </View>
        {notifs.length === 0 ? (
          <Text className="text-sm text-muted">{t("save.alerts.noNotifications")}</Text>
        ) : (
          <View className="gap-2">
            {notifs.map((n) => (
              <NotificationCard key={n.id} notification={n} />
            ))}
          </View>
        )}

        {/* Suscripciones */}
        <Text className="mb-2 mt-8 text-lg font-semibold text-text">
          {t("save.alerts.subscriptions")}
        </Text>
        {subs.length === 0 ? (
          <Text className="text-sm text-muted">{t("save.alerts.noAlerts")}</Text>
        ) : (
          <View className="gap-2">
            {subs.map((a) => (
              <SubscriptionRow key={a.id} alert={a} onRemove={(id) => unsubscribe.mutate(id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

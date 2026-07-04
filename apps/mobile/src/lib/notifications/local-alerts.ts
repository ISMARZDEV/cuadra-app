import { alertNotifications } from "@cuadra/api-client";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

import { t } from "@/i18n";

// Alertas de precio G4 vía notificaciones LOCALES (funciona con firma gratis: NO necesita APNs ni
// el entitlement aps-environment, a diferencia del push remoto que exige Apple Developer de pago —
// docs.expo.dev/push-notifications). La app consulta el feed y dispara una notificación local por
// cada alerta NUEVA. Caveat de iOS: se dispara con la app activa/al volver a foreground; el buzz
// 24/7 con la app cerrada sí requiere push remoto (cuenta de pago).
//
// Dedup persistente en SecureStore: la 1ª corrida marca el histórico como "visto" (no spamea
// alertas viejas); luego solo dispara las que llegan después.

const SEEN_KEY = "cuadra.seen_alert_notifs";
const INIT_KEY = "cuadra.seen_alert_notifs_init";
const MAX_SEEN = 200;

let started = false;

async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function saveSeen(ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify(ids.slice(-MAX_SEEN)));
  } catch {
    // no-op
  }
}

async function checkAndNotify(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const res = await alertNotifications();
    const notifs = res.data ?? [];
    const seen = await loadSeen();

    // Primera vez (nunca inicializado): marca todo como visto para no disparar el histórico.
    const initialized = (await SecureStore.getItemAsync(INIT_KEY)) === "1";
    if (!initialized) {
      await saveSeen(notifs.map((n) => n.id));
      await SecureStore.setItemAsync(INIT_KEY, "1");
      return;
    }

    const fresh = notifs.filter((n) => !seen.has(n.id));
    for (const n of fresh) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t("save.alerts.dropTitle"),
          body: t("save.alerts.dropBody", { product: n.product_name, store: n.provider_name }),
          data: { canonical_product_id: n.canonical_product_id },
        },
        trigger: null, // presentar de inmediato
      });
    }
    if (fresh.length > 0) {
      await saveSeen([...seen, ...fresh.map((n) => n.id)]);
    }
  } catch {
    // módulo nativo ausente / red / permiso → no-op
  }
}

// Arranca el chequeo de alertas locales: pide permiso, chequea al inicio y cada vez que la app
// vuelve a primer plano. Idempotente (se engancha una sola vez).
export async function startLocalAlertNotifications(): Promise<void> {
  if (started) return;
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && !(await Notifications.requestPermissionsAsync()).granted) return;
  } catch {
    return; // sin módulo nativo (dev build sin expo-notifications) → no hace nada
  }

  started = true;
  await checkAndNotify();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void checkAndNotify();
  });
}

import { registerPushToken } from "@cuadra/api-client";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Registro de push notifications (G4). Pide permiso, obtiene el Expo push token y lo manda al
// backend (POST /save/alerts/push-token, Bearer del interceptor). El backend lo usa en el matching
// para enviar el 'buzz' cuando baja un precio que el usuario sigue.
//
// PREREQUISITOS (no automatizables):
//  1. `eas init` en apps/mobile → deja `extra.eas.projectId` (Expo lo exige para el token).
//  2. Dev build reconstruido (expo-notifications es módulo NATIVO) en un DISPOSITIVO FÍSICO
//     (los push tokens no funcionan en simulador).

// Muestra la notificación aunque la app esté en primer plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return; // los push tokens solo existen en dispositivo real

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // sin EAS project (falta `eas init`) no hay token

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken({ body: { token, platform: Platform.OS } });
  } catch {
    // best-effort: si falla el registro, la app sigue; el feed in-app igual funciona
  }
}

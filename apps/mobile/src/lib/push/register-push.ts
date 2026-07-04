import { registerPushToken } from "@cuadra/api-client";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Registro de push notifications (G4). Pide permiso, obtiene el Expo push token y lo manda al
// backend (POST /save/alerts/push-token, Bearer del interceptor). El backend lo usa en el matching
// para enviar el 'buzz' cuando baja un precio que el usuario sigue.
//
// A PRUEBA DE FALLOS: expo-notifications es un módulo NATIVO. Se importa de forma DINÁMICA dentro
// de un try/catch → si el dev build actual no lo tiene enlazado (o falla el permiso/red), la app
// NO crashea; simplemente no registra push y el feed in-app sigue funcionando. Para que el push
// realmente funcione hacen falta (una vez):
//  1. `eas init` en apps/mobile → `extra.eas.projectId` (Expo lo exige para el token).
//  2. Reconstruir el dev build (para enlazar el módulo nativo) en un DISPOSITIVO FÍSICO.

export async function registerForPushNotifications(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const Device = await import("expo-device");

    if (!Device.isDevice) return; // los push tokens solo existen en dispositivo real

    // Muestra la notificación aunque la app esté en primer plano.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

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

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken({ body: { token, platform: Platform.OS } });
  } catch {
    // módulo nativo ausente / permiso denegado / red → no-op (el feed in-app igual funciona)
  }
}

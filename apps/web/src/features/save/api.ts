import {
  alertNotifications,
  listAlerts,
  markNotificationsRead,
  subscribeAlert,
  unsubscribeAlert,
} from "@cuadra/api-client";

import { apiClient } from "@/lib/api";
import { authHeaders } from "@/features/save/hooks/use-auth";

// Llamadas autenticadas de alertas (G4): inyectan el header Bearer del usuario. Todas client-side.
// authHeaders() es async (el getter de Clerk lo es) → cada wrapper la awaita.
export const subscribe = async (productId: string, thresholdMinor?: number | null) =>
  subscribeAlert({
    client: apiClient,
    headers: await authHeaders(),
    body: { product_id: productId, threshold_minor: thresholdMinor ?? null },
  });

export const myAlerts = async () => listAlerts({ client: apiClient, headers: await authHeaders() });

export const removeAlert = async (alertId: string) =>
  unsubscribeAlert({ client: apiClient, headers: await authHeaders(), path: { alert_id: alertId } });

export const myNotifications = async () =>
  alertNotifications({ client: apiClient, headers: await authHeaders() });

// Marca leídas todas las notificaciones del usuario (al abrir el feed) → limpia el badge del bell.
export const readNotifications = async () =>
  markNotificationsRead({ client: apiClient, headers: await authHeaders() });
